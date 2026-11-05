import { fromAuthenticating, fromConnecting } from "./connection-admission";
import { fromOpen, fromReconnecting } from "./connection-live";
import type {
  MachineContext,
  MachineEvent,
  MachineState,
  Phase,
  Step,
} from "./connection-machine-types";
import { connect, stay } from "./connection-steps";

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
