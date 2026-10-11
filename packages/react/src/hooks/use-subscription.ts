import type { ConnectionStatus, SSEEvent, SSESubscription } from "@noverax/courier/realtime";
/* A namespace import, not named hooks: the package entry is reachable from
   Server Components, and Next.js refuses to build a server module that names
   a client-only hook such as useState among its imports. */
import * as React from "react";

import type { CourierSubscriptionOptions, SubscriptionResult } from "../types";
import { consumeStream, toError } from "./consume-stream";
import { useEffectEvent } from "./effect-event";
import { useKeyedStatus } from "./keyed-status";
import { streamKeyOf } from "./stream-key";

/** A group hook's options, as `useSubscription` takes them untyped. */
export type UseSubscriptionOptions<TData> = CourierSubscriptionOptions<TData, unknown>;

/** How many of a stream's latest events are kept when nothing else is said. */
const DEFAULT_MAX_EVENTS = 100;

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
 * over with it — no events, the optimistic data, no error, and `connecting` —
 * in the same render that asks for it, so nothing of the previous stream is
 * ever shown as the new one's. `events` keeps the latest `maxEvents`, 100 by
 * default: kept whole, a long-lived stream grew the list, and the copying of
 * it, without end. A stream that cannot be opened at all, such as one whose
 * proxy path is misconfigured, reports that through `error` and `onError`.
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
    maxEvents = DEFAULT_MAX_EVENTS,
    onData,
    onError,
    onStatusChange,
  } = options ?? {};
  const { key, variablesKey } = streamKeyOf(group, method, variables);

  const [stream, setStream] = React.useState(() => emptyStream(key, optimisticData));
  const current = stream.key === key ? stream : emptyStream(key, optimisticData);
  if (current !== stream) setStream(current);
  const [status, reportStatus] = useKeyedStatus(key, enabled);

  /* Called as the stream speaks, with what the component last rendered: a new
     handler, or a new window of events, applies without reopening the stream. */
  const handleData = useEffectEvent((event: SSEEvent<TData>) => onData?.(event));
  const handleError = useEffectEvent((error: Error) => onError?.(error));
  const handleStatus = useEffectEvent((next: ConnectionStatus) => onStatusChange?.(next));
  const windowOf = useEffectEvent(() => maxEvents);

  const subRef = React.useRef<SSESubscription<unknown> | null>(null);

  const close = React.useCallback(() => {
    subRef.current?.close();
    subRef.current = null;
  }, []);

  React.useEffect(() => {
    if (!enabled) return;

    const vars = variablesKey ? (JSON.parse(variablesKey) as unknown) : undefined;
    let active = true;
    let sub: SSESubscription<unknown> | null = null;
    let unsubStatus: (() => void) | undefined;

    const fail = (error: Error) => {
      if (!active) return;
      setStream((prev) => (prev.key === key ? { ...prev, error } : prev));
      handleError(error);
    };
    const receive = (event: SSEEvent<TData>) => {
      if (!active) return;
      /* Read here, not in the update, which React runs as it renders. */
      const max = windowOf();
      setStream((prev) =>
        prev.key === key
          ? {
              key,
              data: event.data,
              events: latestOf([...prev.events, event], max),
              error: undefined,
            }
          : prev,
      );
      handleData(event);
    };
    const report = (next: ConnectionStatus) => {
      reportStatus({ key, status: next });
      handleStatus(next);
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
        report("disconnected");
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
      reportStatus(undefined);
    };
  }, [enabled, group, method, key, variablesKey, subscribe, reportStatus]);

  const events = latestOf(current.events, maxEvents);
  return { data: current.data, events, status, error: current.error, close };
}

/* The latest `max` of a stream's events: the same list when it holds no more. */
function latestOf<TData>(events: SSEEvent<TData>[], max: number): SSEEvent<TData>[] {
  if (events.length <= max) return events;
  return max > 0 ? events.slice(events.length - max) : [];
}

function emptyStream<TData>(key: string, optimisticData: TData | undefined): StreamState<TData> {
  return { key, data: optimisticData, events: [], error: undefined };
}
