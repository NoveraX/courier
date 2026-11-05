import type { MachineContext, MachineEvent, Phase, Step } from "./connection-machine-types";
import { fail, onClosed, schedule, stay } from "./connection-steps";

/*
 * How a connection is admitted: its credentials, a socket opened with
 * them, the `auth` frame on it, and the server's answer — each within the
 * phase's deadline.
 */

/** Where a connection waiting for its credentials or its socket goes next. */
export function fromConnecting(
  state: Phase<"connecting">,
  event: MachineEvent,
  ctx: MachineContext,
): Step {
  switch (event.type) {
    case "credentials":
      return credentialsCame(state, event.fingerprint);
    case "credentials-failed":
      /* An answer for credentials the attempt no longer waits for: its socket is opening. */
      if (state.socket) return stay(state);
      return schedule(state, ctx, { kind: "credentials", error: event.error }, []);
    case "socket-failed":
      return fail(state, event.error);
    case "socket-open": {
      if (state.fingerprint === undefined) return stay(state);
      const authId = `a${state.authSeq + 1}`;
      return {
        state: {
          phase: "authenticating",
          failures: state.failures,
          authSeq: state.authSeq + 1,
          refusal: state.refusal,
          authId,
          fingerprint: state.fingerprint,
          deadline: { ms: ctx.authTimeoutMs, fires: "timeout" },
        },
        effects: [{ type: "send-auth", id: authId, opening: true }],
      };
    }
    case "closed":
      return onClosed(state, ctx, event.closure, event.announced, event.error);
    case "timeout": {
      const drop = state.socket
        ? [{ type: "drop-socket", code: 4100, reason: "Connect timed out" } as const]
        : [];
      return schedule(state, ctx, { kind: "timeout", waitingFor: "socket" }, drop);
    }
    default:
      return stay(state);
  }
}

/*
 * The credentials for an attempt came. When the server refused the last
 * ones, only different ones are sent: the same again would be refused again,
 * and a loop of refusals only loads the server and whoever issues tokens.
 */
function credentialsCame(state: Phase<"connecting">, fingerprint: string): Step {
  if (state.socket) return stay(state);
  const { refusal } = state;
  if (refusal && !refusal.retried) {
    if (refusal.fingerprint === fingerprint) return fail(state, refusal.error);
    return {
      state: { ...state, socket: true, fingerprint, refusal: { ...refusal, retried: true } },
      effects: [{ type: "open-socket" }],
    };
  }
  return { state: { ...state, socket: true, fingerprint }, effects: [{ type: "open-socket" }] };
}

/** Where a connection waiting for the server to admit it goes next. */
export function fromAuthenticating(
  state: Phase<"authenticating">,
  event: MachineEvent,
  ctx: MachineContext,
): Step {
  switch (event.type) {
    case "admitted":
      return {
        state: {
          phase: "open",
          failures: state.failures,
          authSeq: state.authSeq,
          connectionId: event.connectionId,
          heartbeat: event.heartbeat,
          openedAt: ctx.now,
          fingerprint: state.fingerprint,
        },
        effects: [{ type: "watch", heartbeat: event.heartbeat }, { type: "flush" }],
      };
    case "mismatch":
      return schedule(state, ctx, { kind: "mismatch", frame: event.frame }, [
        { type: "drop-socket", code: 1002, reason: "Protocol mismatch" },
        { type: "subscriptions-wait" },
      ]);
    case "closed":
      return onClosed(state, ctx, event.closure, event.announced, event.error);
    case "timeout":
      return schedule(state, ctx, { kind: "timeout", waitingFor: "admission" }, [
        { type: "drop-socket", code: 4100, reason: "Admission timed out" },
        { type: "subscriptions-wait" },
      ]);
    default:
      return stay(state);
  }
}
