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
      return { state, effects: [{ type: "probe" }] };
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
  const { failures, authSeq, protocol, openedAt, fingerprint } = state;
  return { phase: "open", failures, authSeq, protocol, openedAt, fingerprint };
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
    case "resume": {
      if (event.signal !== "online") return connect(state, ctx, 0, state.refusal);
      /* The network is back for everyone it dropped at once: each waits a little at random. */
      const retryIn = ctx.spread();
      return {
        state: { ...state, failures: 0, retryIn, deadline: { ms: retryIn, fires: "retry" } },
        effects: [],
      };
    }
    default:
      return stay(state);
  }
}
