"use client";

import type { ConnectionStatus, SSEEvent, SSESubscription } from "@noverax/nexus/realtime";
import { useCallback, useEffect, useRef, useState } from "react";

import type { SubscriptionResult } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseSubscriptionOptions<TData> {
  /** Variables passed to the SSE endpoint */
  variables?: unknown;
  /** Disable the subscription (default: true) */
  enabled?: boolean;
  /** Data to show immediately while the connection is being established */
  optimisticData?: TData;
  /** Called on each incoming SSE event */
  onData?: (event: SSEEvent<TData>) => void;
  /** Called when a connection error occurs */
  onError?: (error: Error) => void;
  /** Called on connection status changes */
  onStatusChange?: (status: ConnectionStatus) => void;
}

/** Internal factory type — creates SSESubscription from group+method+variables */
export type SubscribeFn = (
  group: string,
  method: string,
  variables?: unknown,
) => SSESubscription<unknown>;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Subscribe to a server-sent event stream with automatic lifecycle management.
 *
 * @param subscribe - Factory that creates an SSESubscription (injected by createGroupHooks)
 * @param group - API group name
 * @param method - Endpoint method name
 * @param options - Subscription configuration
 * @returns Reactive subscription state
 */
export function useSubscription<TData>(
  subscribe: SubscribeFn,
  group: string,
  method: string,
  options?: UseSubscriptionOptions<TData>,
): SubscriptionResult<TData> {
  const {
    variables,
    enabled = true,
    optimisticData,
    onData,
    onError,
    onStatusChange,
  } = options ?? {};

  const [data, setData] = useState<TData | undefined>(optimisticData);
  const [events, setEvents] = useState<SSEEvent<TData>[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [error, setError] = useState<Error | undefined>(undefined);

  // Stable refs for callbacks — avoids re-subscribing on handler identity change
  const callbacksRef = useRef({ onData, onError, onStatusChange });
  callbacksRef.current = { onData, onError, onStatusChange };

  const subRef = useRef<SSESubscription<unknown> | null>(null);

  const close = useCallback(() => {
    subRef.current?.close();
    subRef.current = null;
  }, []);

  // Serialize variables for stable dependency tracking
  const variablesKey = JSON.stringify(variables);

  useEffect(() => {
    if (!enabled) {
      setStatus("disconnected");
      return;
    }

    // Parse variables from serialized key — ensures stable identity for resubscribe
    const vars = variablesKey ? (JSON.parse(variablesKey) as unknown) : undefined;

    // Defer the actual subscribe to a microtask so React 19 StrictMode
    // (dev-mode mount → cleanup → mount) tears down the first effect before
    // any network I/O fires. Without this, StrictMode produces two real
    // subscriptions and two duplicate Studio Timeline entries.
    let cancelled = false;
    let sub: SSESubscription<unknown> | null = null;
    let unsubStatus: (() => void) | undefined;

    queueMicrotask(() => {
      if (cancelled) return;
      sub = subscribe(group, method, vars);
      subRef.current = sub;

      unsubStatus = sub.on("status", (s) => {
        setStatus(s);
        callbacksRef.current.onStatusChange?.(s);
      });

      consumeStream(sub, callbacksRef, setData, setEvents, setError);
    });

    return () => {
      cancelled = true;
      unsubStatus?.();
      sub?.close();
      if (subRef.current === sub) {
        subRef.current = null;
      }
    };
  }, [enabled, group, method, variablesKey, subscribe]);

  return { data, events, status, error, close };
}

// ---------------------------------------------------------------------------
// Stream consumer
// ---------------------------------------------------------------------------

async function consumeStream<TData>(
  sub: SSESubscription<unknown>,
  callbacksRef: React.RefObject<{
    onData?: (e: SSEEvent<TData>) => void;
    onError?: (e: Error) => void;
  }>,
  setData: React.Dispatch<React.SetStateAction<TData | undefined>>,
  setEvents: React.Dispatch<React.SetStateAction<SSEEvent<TData>[]>>,
  setError: React.Dispatch<React.SetStateAction<Error | undefined>>,
): Promise<void> {
  try {
    for await (const event of sub) {
      const typed = event as SSEEvent<TData>;
      setData(typed.data);
      setEvents((prev) => [...prev, typed]);
      setError(undefined);
      callbacksRef.current?.onData?.(typed);
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    setError(error);
    callbacksRef.current?.onError?.(error);
  }
}
