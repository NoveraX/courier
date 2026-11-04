import type { MachineContext, MachineEvent, MachineState, Step } from "./connection-machine-types";
import { connect, fail, onClosed, schedule, stay } from "./connection-steps";

type Phase<TPhase extends MachineState["phase"]> = Extract<MachineState, { phase: TPhase }>;

/**
 * A WebSocket connection's state machine: given where the connection stands
 * and what happened, where it stands next and what it does — open a socket,
 * send its credentials, drop it, tell its subscriptions. It reads no clock,
 * timer or socket; the connection runs what it returns, and hands it the time.
 *
 * `idle → connecting → authenticating → open ⇄ reauthenticating`, and from
 * there `reconnecting`, `closed` or `failed`. A connection is `open` — its
 * status `connected` — only once the server has admitted it.
 *
 * @param state - Where the connection stands
 * @param event - What happened
 * @param ctx - The time, and how long the connection waits for what
 * @returns The next state, and what to do
 * @example
 * ```ts
 * const { state, effects } = transition(current, { type: "socket-open" }, ctx);
 * ```
 */
export function transition(state: MachineState, event: MachineEvent, ctx: MachineContext): Step {
  if (event.type === "close") return closeByClient(state);
  switch (state.phase) {
    case "idle":
      return event.type === "start" || event.type === "reconnect"
        ? connect(state, ctx, 0, undefined)
        : stay(state);
    case "connecting":
      return fromConnecting(state, event, ctx);
    case "authenticating":
      return fromAuthenticating(state, event, ctx);
    case "open":
    case "reauthenticating":
      return fromOpen(state, event, ctx);
    case "reconnecting":
      return fromReconnecting(state, event, ctx);
    case "closed":
    case "failed":
      return fromEnded(state, event, ctx);
  }
}

function fromConnecting(
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

function fromAuthenticating(
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
          protocol: event.protocol,
          openedAt: ctx.now,
          fingerprint: state.fingerprint,
        },
        effects: [{ type: "watch" }, { type: "flush" }],
      };
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

function fromOpen(
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

function fromReconnecting(
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

function fromEnded(
  state: Phase<"closed" | "failed">,
  event: MachineEvent,
  ctx: MachineContext,
): Step {
  if (event.type !== "reconnect") return stay(state);
  if (state.phase === "closed" && state.by === "client") return stay(state);
  return connect(state, ctx, 0, undefined);
}

function closeByClient(state: MachineState): Step {
  if (state.phase === "closed" && state.by === "client") return stay(state);
  const socket =
    state.phase === "authenticating" ||
    state.phase === "open" ||
    state.phase === "reauthenticating" ||
    (state.phase === "connecting" && state.socket);
  const live = state.phase === "open" || state.phase === "reauthenticating";
  const ended = state.phase === "closed" || state.phase === "failed";
  return {
    state: { phase: "closed", by: "client", failures: 0, authSeq: state.authSeq },
    effects: [
      ...(socket ? [{ type: "drop-socket", code: 1000, reason: "Client closed" } as const] : []),
      ...(live ? [{ type: "unwatch" } as const] : []),
      ...(ended ? [] : [{ type: "subscriptions-end" } as const]),
    ],
  };
}
