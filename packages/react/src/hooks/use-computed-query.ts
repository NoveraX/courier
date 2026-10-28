import type { SSEEvent } from "@noverax/courier/realtime";
import type { QueryKey, UseQueryResult } from "@tanstack/react-query";
import { hashKey, useQuery, useQueryClient } from "@tanstack/react-query";
/* A namespace import, not named hooks: the package entry is reachable from
   Server Components, and Next.js refuses to build a server module that names
   a client-only hook such as useState among its imports. */
import * as React from "react";

import { QUERY_RETRIES, retryUnlessCancelled } from "../retry-unless-cancelled";
import type { CourierComputedQueryOptions } from "../types";
import { useLatest } from "./effect-event";
import type { SubscribeFn } from "./use-subscription";
import { useSubscription } from "./use-subscription";

/** A group hook's options, as `useComputedQuery` takes them untyped. */
export type UseComputedQueryOptions<TQueryData, TStreamData> = CourierComputedQueryOptions<
  TQueryData,
  TStreamData,
  unknown
>;

/** Stream events held until the query they merge into has data. */
interface HeldEvents<TStreamData> {
  queryHash: string;
  events: SSEEvent<TStreamData>[];
}

/**
 * Combines a standard HTTP query with an SSE subscription that auto-updates
 * the query cache on each event via the provided mapper function.
 *
 * The stream opens together with the query, so its first events can come
 * before the query's first answer. Those are held and merged, in order, into
 * that answer before it is cached: merged into nothing, they would have made
 * the query succeed with the stream's events alone, and then been overwritten.
 * A stream that fails, is refused or cannot be opened leaves the query as it
 * is, and says so through `onStreamError`.
 *
 * @param queryFn - Executes the HTTP endpoint; aborts when the signal does
 * @param subscribeFn - Factory that creates an SSESubscription
 * @param queryKey - Cache key for react-query
 * @param groupName - API group name
 * @param options - Query + subscription + mapper configuration
 * @returns Standard UseQueryResult with live-updating data
 *
 * @example
 * q.users.useComputedQuery("getAll", {
 *   subscriptionMethod: "stream",
 *   mapper: (users, event) => [...(users ?? []), event.data],
 * })
 */
export function useComputedQuery<TQueryData, TStreamData>(
  queryFn: (variables: unknown, signal: AbortSignal) => Promise<TQueryData>,
  subscribeFn: SubscribeFn,
  queryKey: QueryKey,
  groupName: string,
  options: UseComputedQueryOptions<TQueryData, TStreamData>,
): UseQueryResult<TQueryData, Error> {
  const { variables, enabled = true, staleTime } = options;
  const queryClient = useQueryClient();
  const queryHash = hashKey(queryKey);
  const held = React.useRef<HeldEvents<TStreamData>>({ queryHash, events: [] });
  /* The events held for this query's key: those held for another are dropped,
     here rather than as it renders, which React may throw away. */
  const heldHere = () => {
    if (held.current.queryHash !== queryHash) held.current = { queryHash, events: [] };
    return held.current;
  };

  const mapperRef = useLatest(options.mapper);
  /** The events held for this query's key, handed over once. */
  const take = () => {
    const { events } = heldHere();
    held.current = { queryHash, events: [] };
    return events;
  };

  const queryResult = useQuery<TQueryData, Error>({
    queryKey,
    queryFn: async ({ signal }) => {
      const answer = await queryFn(variables, signal);
      return take().reduce<TQueryData>((merged, event) => mapperRef.current(merged, event), answer);
    },
    enabled,
    ...(staleTime !== undefined && { staleTime }),
    retry: retryUnlessCancelled(
      queryClient,
      queryKey,
      undefined,
      options.requestOptions?.signal,
      QUERY_RETRIES,
    ),
  });

  const merge = (events: SSEEvent<TStreamData>[]) =>
    queryClient.setQueryData<TQueryData>(queryKey, (current) =>
      events.reduce<TQueryData | undefined>((merged, e) => mapperRef.current(merged, e), current),
    );

  useSubscription<TStreamData>(subscribeFn, groupName, options.subscriptionMethod, {
    variables: options.subscriptionVariables ?? variables,
    enabled,
    /* Every event goes into the query; none is kept beside it. */
    maxEvents: 0,
    onError: options.onStreamError,
    onStatusChange: options.onStreamStatusChange,
    onData: (event) => {
      const pending = heldHere().events;
      if (pending.length > 0 || queryClient.getQueryData(queryKey) === undefined) {
        pending.push(event);
        return;
      }
      merge([event]);
    },
  });

  /* An event can still slip in after the answer came back but before it
     was cached; it waits here for the next render. */
  React.useEffect(() => {
    if (queryResult.data === undefined || heldHere().events.length === 0) return;
    merge(take());
  });

  return queryResult;
}
