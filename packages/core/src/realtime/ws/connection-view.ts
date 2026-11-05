import { ConnectionError } from "../errors";
import type { ConnectionRetry } from "../retry-of";
import type { ConnectionStatus } from "../types";
import type { MachineState, WSConnectionState } from "./connection-machine-types";

const views = new WeakMap<MachineState, WSConnectionState>();

/**
 * A connection's state as the application reads it: the phase and why,
 * without what only its machine keeps. The same object for the same state,
 * so a view that compares snapshots — React's `useSyncExternalStore` — sees
 * a change only when there is one.
 *
 * @param state - The machine's state
 * @returns What `connection.state` reads
 */
export function publicStateOf(state: MachineState): WSConnectionState {
  let view = views.get(state);
  if (view === undefined) {
    view = viewOf(state);
    views.set(state, view);
  }
  return view;
}

function viewOf(state: MachineState): WSConnectionState {
  switch (state.phase) {
    case "idle":
      return { phase: "idle" };
    case "connecting":
    case "authenticating":
      return { phase: state.phase, attempt: state.failures + 1 };
    case "open":
    case "reauthenticating":
      return { phase: state.phase, connectionId: state.connectionId };
    case "reconnecting":
      return {
        phase: "reconnecting",
        attempt: state.failures + 1,
        retryIn: state.retryIn,
        cause: state.cause,
      };
    case "closed":
      return { phase: "closed", by: state.by };
    case "failed":
      return { phase: "failed", error: state.error };
  }
}

/**
 * The four-word status a state reads as: `connected` only once the server
 * has admitted the connection.
 *
 * @param state - The machine's state
 * @returns Its status
 */
export function statusOf(state: MachineState): ConnectionStatus {
  switch (state.phase) {
    case "connecting":
    case "authenticating":
      return "connecting";
    case "open":
    case "reauthenticating":
      return "connected";
    case "reconnecting":
      return "reconnecting";
    default:
      return "disconnected";
  }
}

/**
 * Why a connection waiting to reconnect is waiting, as Studio tells it.
 *
 * @param state - The machine's state
 * @returns The retry, while the connection waits to reconnect
 */
export function retryOfState(state: MachineState): ConnectionRetry | undefined {
  if (state.phase !== "reconnecting") return undefined;
  const base = { failures: state.failures, retryIn: state.retryIn };
  const { cause } = state;
  switch (cause.kind) {
    case "closed":
      return {
        ...base,
        closed: { code: cause.code, reason: cause.reason },
        opened: cause.opened,
        ...(cause.error !== undefined && { error: cause.error }),
      };
    case "silent":
      return { ...base, silentFor: cause.forMs };
    case "mismatch":
      return {
        ...base,
        error: new ConnectionError(
          `The server's first frame (${cause.frame}) answers no auth: it speaks another version of the protocol`,
        ),
      };
    case "timeout":
      return { ...base, error: new ConnectionError(timeoutText(cause.waitingFor)) };
    case "credentials":
      return { ...base, error: cause.error };
  }
}

function timeoutText(waitingFor: "socket" | "admission" | "renewal"): string {
  if (waitingFor === "socket") return "The socket did not open in time";
  if (waitingFor === "admission") return "The server did not admit the connection in time";
  return "The server did not take the credentials sent again in time";
}
