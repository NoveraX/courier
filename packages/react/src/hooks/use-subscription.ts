import type { ConnectionStatus, SSEEvent, SSESubscription } from "@noverax/courier/realtime";
/* A namespace import, not named hooks: the package entry is reachable from
   Server Components, and Next.js refuses to build a server module that names
   a client-only hook such as useState among its imports. */
import * as React from "react";

import type { CourierSubscriptionOptions, SubscriptionResult } from "../types";
import { consumeStream, toError } from "./consume-stream";
import { streamKeyOf } from "./stream-key";

/** A group hook's options, as `useSubscription` takes them untyped. */
export type UseSubscriptionOptions<TData> = CourierSubscriptionOptions<TData, unknown>;

/** Internal factory type — creates SSESubscription from group+method+variables */
export type SubscribeFn = (
  group: string,
  method: string,
  variables?: unknown,
) => SSESubscription<unknown>;

/** What one stream has delivered; `key` names the stream it belongs to. */
interface StreamState<TData> {
  key: string;
  data: TData | undefined;
  events: SSEEvent<TData>[];
  error: Error | undefined;
}

/**
 * Subscribe to a server-sent event stream with automatic lifecycle management.
 *
 * A change of method or variables opens another stream, and the result starts
 * over with it — no events, the optimistic data, no error — in the same render
 * that asks for it, so nothing of the previous stream is ever shown as the new
 * one's. A stream that cannot be opened at all, such as one whose proxy path
 * is misconfigured, reports that through `error` and `onError`.
 *
 * @param subscribe - Factory that creates an SSESubscription (injected by createGroupHooks)
 * @param group - API group name
 * @param method - Endpoint method name
 * @param options - Subscription configuration
 * @returns Reactive subscription state
 * @example
 * const { data, events, status } = useSubscription(subscribeFn, "live", "ticks", {
 *   variables: { n: 3 },
 * });
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
  const { key, variablesKey } = streamKeyOf(group, method, variables);

  const [stream, setStream] = React.useState(() => emptyStream(key, optimisticData));
  const [status, setStatus] = React.useState<ConnectionStatus>("disconnected");
  const current = stream.key === key ? stream : emptyStream(key, optimisticData);
  if (current !== stream) setStream(current);

  // Stable refs for callbacks — avoids re-subscribing on handler identity change
  const callbacksRef = React.useRef({ onData, onError, onStatusChange });
  callbacksRef.current = { onData, onError, onStatusChange };

  const subRef = React.useRef<SSESubscription<unknown> | null>(null);

  const close = React.useCallback(() => {
    subRef.current?.close();
    subRef.current = null;
  }, []);

  React.useEffect(() => {
    if (!enabled) {
      setStatus("disconnected");
      return;
    }

    const vars = variablesKey ? (JSON.parse(variablesKey) as unknown) : undefined;
    let active = true;
    let sub: SSESubscription<unknown> | null = null;
    let unsubStatus: (() => void) | undefined;

    const fail = (error: Error) => {
      if (!active) return;
      setStream((prev) => (prev.key === key ? { ...prev, error } : prev));
      callbacksRef.current.onError?.(error);
    };
    const receive = (event: SSEEvent<TData>) => {
      if (!active) return;
      setStream((prev) =>
        prev.key === key
          ? { key, data: event.data, events: [...prev.events, event], error: undefined }
          : prev,
      );
      callbacksRef.current.onData?.(event);
    };
    const report = (next: ConnectionStatus) => {
      setStatus(next);
      callbacksRef.current.onStatusChange?.(next);
    };

    // Defer the actual subscribe to a microtask so React 19 StrictMode
    // (dev-mode mount → cleanup → mount) tears down the first effect before
    // any network I/O fires. Without this, StrictMode produces two real
    // subscriptions and two duplicate Studio Timeline entries.
    queueMicrotask(() => {
      if (!active) return;
      try {
        sub = subscribe(group, method, vars);
      } catch (error) {
        fail(toError(error));
        return;
      }
      subRef.current = sub;
      /* The subscription is already opening by the time it is returned, so
         its first status came and went before anyone listened. */
      report(sub.status);
      unsubStatus = sub.on("status", report);
      void consumeStream(sub, receive, fail);
    });

    return () => {
      active = false;
      unsubStatus?.();
      sub?.close();
      if (subRef.current === sub) {
        subRef.current = null;
      }
    };
  }, [enabled, group, method, key, variablesKey, subscribe]);

  return { data: current.data, events: current.events, status, error: current.error, close };
}

function emptyStream<TData>(key: string, optimisticData: TData | undefined): StreamState<TData> {
  return { key, data: optimisticData, events: [], error: undefined };
}
