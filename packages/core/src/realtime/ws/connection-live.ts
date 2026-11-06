import type { ResumeSignal } from "../resume-signals";
import type { MachineContext, MachineEvent, Phase, Step } from "./connection-machine-types";
import { connect, onClosed, schedule, stay } from "./connection-steps";

/** Where an admitted connection goes next: renewing its credentials, or leaving its socket. */
export function fromOpen(
  state: Phase<"open" | "reauthenticating">,
  event: MachineEvent,
  ctx: MachineContext,
): Step {
  switch (event.type) {
    case "renewal-requested":
      return state.phase === "open" ? startRenewal(state, ctx) : stay(state);
    case "credentials":
      if (state.phase !== "reauthenticating") return stay(state);
      return {
        state: { ...state, fingerprint: event.fingerprint },
        effects: [{ type: "send-auth", id: state.authId, opening: false }],
      };
    case "credentials-failed":
    case "renewed":
      return state.phase === "reauthenticating"
        ? { state: backToOpen(state), effects: [] }
        : stay(state);
    case "closed":
      return onClosed(state, ctx, event.closure, event.announced, event.error);
    case "silent":
      return schedule(
        state,
        ctx,
        { kind: "silent", forMs: event.forMs },
        dropped(4100, "Server silent"),
      );
    case "timeout":
      if (state.phase !== "reauthenticating") return stay(state);
      return schedule(
        state,
        ctx,
        { kind: "timeout", waitingFor: "renewal" },
        dropped(4100, "Renewal timed out"),
      );
    case "reconnect":
      return connect(state, ctx, 0, undefined, dropped(4000, "Reconnecting"));
    case "resume":
      return { state, effects: [{ type: "probe", heartbeat: state.heartbeat }] };
    default:
      return stay(state);
  }
}

function startRenewal(state: Phase<"open">, ctx: MachineContext): Step {
  return {
    state: {
      ...state,
      phase: "reauthenticating",
      authSeq: state.authSeq + 1,
      authId: `a${state.authSeq + 1}`,
      deadline: { ms: ctx.authTimeoutMs, fires: "timeout" },
    },
    effects: [{ type: "ask-credentials" }],
  };
}

function backToOpen(state: Phase<"reauthenticating">): Phase<"open"> {
  const { failures, authSeq, connectionId, heartbeat, openedAt, fingerprint } = state;
  return { phase: "open", failures, authSeq, connectionId, heartbeat, openedAt, fingerprint };
}

/* Leave an open socket: let it go, stop watching it, and hold the subscriptions for the next. */
function dropped(code: number, reason: string) {
  return [
    { type: "drop-socket", code, reason },
    { type: "unwatch" },
    { type: "subscriptions-wait" },
  ] as const;
}

/** Where a connection waiting to reconnect goes next. */
export function fromReconnecting(
  state: Phase<"reconnecting">,
  event: MachineEvent,
  ctx: MachineContext,
): Step {
  switch (event.type) {
    case "retry":
      return connect(state, ctx, state.failures, state.refusal);
    case "reconnect":
      return connect(state, ctx, 0, undefined);
    case "resume":
      return resumed(state, event.signal, ctx);
    default:
      return stay(state);
  }
}

/*
 * A page's signal shortens only the client's own wait, never puts it off.
 * A wait the server asked for — one at capacity, one shutting down — is
 * kept: the connection comes back a little at random after it, the
 * failures in a row still counted, as the server's answer is the same. The
 * network back, for everyone it dropped at once, brings each back a little
 * at random too, and starts the waits over; any other signal reconnects now.
 */
function resumed(state: Phase<"reconnecting">, signal: ResumeSignal, ctx: MachineContext): Step {
  const { notBefore, retryAt } = state;
  const held = notBefore !== undefined && ctx.now < notBefore;
  if (!held && signal !== "online") return connect(state, ctx, 0, state.refusal);
  const at = Math.min((held ? notBefore : ctx.now) + ctx.spread(), retryAt);
  if (held && at === retryAt) return stay(state);
  const failures = held ? state.failures : 0;
  if (at === retryAt) return { state: { ...state, failures }, effects: [] };
  const retryIn = at - ctx.now;
  return {
    state: { ...state, failures, retryIn, retryAt: at, deadline: { ms: retryIn, fires: "retry" } },
    effects: [],
  };
}
