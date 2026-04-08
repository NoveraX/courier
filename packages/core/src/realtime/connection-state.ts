import type { ConnectionStatus } from "./types";

/** Listener callback for connection status changes */
type StatusListener = (status: ConnectionStatus) => void;

/** Observable connection status container with pub/sub */
export interface ConnectionState {
  /** Current connection status */
  readonly current: ConnectionStatus;
  /** Update status and notify all listeners */
  set(status: ConnectionStatus): void;
  /** Subscribe to status changes, returns unsubscribe function */
  subscribe(listener: StatusListener): () => void;
}

/**
 * Create an observable connection status container.
 * Notifies listeners only when status actually changes.
 *
 * @param initial - Starting status (default "disconnected")
 * @returns Observable connection state
 *
 * @example
 * const state = createConnectionState();
 * const unsub = state.subscribe((s) => console.log(s));
 * state.set("connecting"); // logs "connecting"
 * state.set("connecting"); // no-op (same status)
 */
export function createConnectionState(initial: ConnectionStatus = "disconnected"): ConnectionState {
  let current = initial;
  const listeners = new Set<StatusListener>();

  return {
    get current() {
      return current;
    },
    set(status) {
      if (status === current) return;
      current = status;
      for (const listener of listeners) listener(status);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
