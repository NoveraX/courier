import { createConnectionState } from "@noverax/courier/internal-client";
import type { ConnectionStatus } from "@noverax/courier/realtime";
/* A namespace import, not named hooks: the package entry is reachable from
   Server Components, and Next.js refuses to build a server module that names
   a client-only hook such as useState among its imports. */
import * as React from "react";

/** Return type for useConnectionStatus */
export interface ConnectionStatusResult {
  /** Current connection status */
  status: ConnectionStatus;
  /** Whether the transport is connected */
  isConnected: boolean;
  /** Whether the transport is reconnecting after a drop */
  isReconnecting: boolean;
}

/** A transport that reports its status through `onStatusChange`, as a `WSConnection` does */
export interface ConnectionStatusSource {
  /** Current connection status */
  readonly status: ConnectionStatus;
  /** Subscribe to status changes, returns unsubscribe function */
  onStatusChange: (handler: (status: ConnectionStatus) => void) => () => void;
}

/**
 * A transport that reports its status as a `"status"` event, as the
 * `SSESubscription` and the `WSChannel` a caller returns both do
 */
export interface StatusEventSource {
  /** Current connection status */
  readonly status: ConnectionStatus;
  /** Subscribe to status changes, returns unsubscribe function */
  on(event: "status", handler: (status: ConnectionStatus) => void): () => void;
}

/**
 * Observe the connection status of an SSE or WS transport.
 * Uses `useSyncExternalStore` for tear-free concurrent-safe reads.
 *
 * @param source - A `WSConnection`, or an `SSESubscription` or `WSChannel` a caller returned; `null` reads as disconnected
 * @returns Reactive connection status with derived booleans
 *
 * @example
 * const feed = caller.live.feed();
 * const { status, isConnected, isReconnecting } = useConnectionStatus(feed);
 */
export function useConnectionStatus(
  source: ConnectionStatusSource | StatusEventSource | null,
): ConnectionStatusResult {
  // Fallback for null source — always disconnected
  const fallback = React.useMemo(() => asSource(createConnectionState("disconnected")), []);
  const target = source ?? fallback;

  const subscribe = React.useCallback(
    (onStoreChange: () => void) => listen(target, onStoreChange),
    [target],
  );

  const getSnapshot = React.useCallback(() => target.status, [target]);

  const status = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return React.useMemo<ConnectionStatusResult>(
    () => ({
      status,
      isConnected: status === "connected",
      isReconnecting: status === "reconnecting",
    }),
    [status],
  );
}

function listen(
  source: ConnectionStatusSource | StatusEventSource,
  handler: (status: ConnectionStatus) => void,
): () => void {
  return "onStatusChange" in source ? source.onStatusChange(handler) : source.on("status", handler);
}

function asSource(state: ReturnType<typeof createConnectionState>): ConnectionStatusSource {
  return {
    get status() {
      return state.current;
    },
    onStatusChange: (handler) => state.subscribe(handler),
  };
}
