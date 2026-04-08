"use client";

import type { ConnectionStatus } from "@noverax/nexus/realtime";
import { createConnectionState } from "@noverax/nexus/realtime";
import { useCallback, useMemo, useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Return type for useConnectionStatus */
export interface ConnectionStatusResult {
  /** Current connection status */
  status: ConnectionStatus;
  /** Whether the transport is connected */
  isConnected: boolean;
  /** Whether the transport is reconnecting after a drop */
  isReconnecting: boolean;
}

/** Adapter that exposes a transport's connection state */
export interface ConnectionStatusSource {
  /** Current connection status */
  readonly status: ConnectionStatus;
  /** Subscribe to status changes, returns unsubscribe function */
  onStatusChange: (handler: (status: ConnectionStatus) => void) => () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Observe the connection status of an SSE or WS transport.
 * Uses `useSyncExternalStore` for tear-free concurrent-safe reads.
 *
 * @param source - Any object exposing `status` and `onStatusChange` (SSESubscription, WSConnection)
 * @returns Reactive connection status with derived booleans
 *
 * @example
 * const { status, isConnected, isReconnecting } = useConnectionStatus(wsConnection);
 */
export function useConnectionStatus(source: ConnectionStatusSource | null): ConnectionStatusResult {
  // Fallback for null source — always disconnected
  const fallback = useMemo(() => createConnectionState("disconnected"), []);
  const target = source ?? asFallback(fallback);

  const subscribe = useCallback(
    (onStoreChange: () => void) => target.onStatusChange(onStoreChange),
    [target],
  );

  const getSnapshot = useCallback(() => target.status, [target]);

  const status = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo<ConnectionStatusResult>(
    () => ({
      status,
      isConnected: status === "connected",
      isReconnecting: status === "reconnecting",
    }),
    [status],
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asFallback(state: ReturnType<typeof createConnectionState>): ConnectionStatusSource {
  return {
    get status() {
      return state.current;
    },
    onStatusChange: (handler) => state.subscribe(handler),
  };
}
