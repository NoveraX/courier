import type { CallOptions, HTTPError } from "@noverax/courier";
import type { SSEEvent } from "@noverax/courier/realtime";
import type { QueryKey, UseQueryResult } from "@tanstack/react-query";
import { hashKey, useQuery, useQueryClient } from "@tanstack/react-query";
/* A namespace import, not named hooks: the package entry is reachable from
   Server Components, and Next.js refuses to build a server module that names
   a client-only hook such as useState among its imports. */
import * as React from "react";

import type { SubscribeFn } from "./use-subscription";
import { useSubscription } from "./use-subscription";

export interface UseComputedQueryOptions<TQueryData, TStreamData, TVariables> {
  /** Variables for the HTTP query endpoint */
  variables?: TVariables;
  /** SSE endpoint method name (on the same group) that provides live updates */
  subscriptionMethod: string;
  /** Variables for the SSE subscription (defaults to query variables) */
  subscriptionVariables?: unknown;
  /** Merge each stream event into the cached query data */
  mapper: (current: TQueryData | undefined, event: SSEEvent<TStreamData>) => TQueryData;
  /** Disable both query and subscription (default: true) */
  enabled?: boolean;
  /** react-query staleTime */
  staleTime?: number;
  /** Per-request options for the HTTP query */
  requestOptions?: CallOptions;
}

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
  queryFn: (variables: unknown, signal: AbortSignal) => Promise<unknown>,
  subscribeFn: SubscribeFn,
  queryKey: QueryKey,
  groupName: string,
  options: UseComputedQueryOptions<TQueryData, TStreamData, unknown>,
): UseQueryResult<TQueryData, HTTPError> {
  const { variables, enabled = true, staleTime } = options;
  const queryClient = useQueryClient();
  const queryHash = hashKey(queryKey);
  const held = React.useRef<HeldEvents<TStreamData>>({ queryHash, events: [] });
  if (held.current.queryHash !== queryHash) held.current = { queryHash, events: [] };

  const mapperRef = React.useRef(options.mapper);
  mapperRef.current = options.mapper;
  /** The events held for this query's key, handed over once. */
  const take = () => {
    if (held.current.queryHash !== queryHash) return [];
    const { events } = held.current;
    held.current = { queryHash, events: [] };
    return events;
  };

  const queryResult = useQuery<TQueryData, HTTPError>({
    queryKey,
    queryFn: async ({ signal }) => {
      const answer = (await queryFn(variables, signal)) as TQueryData;
      return take().reduce((merged, event) => mapperRef.current(merged, event), answer);
    },
    enabled,
    staleTime,
  });

  const merge = (events: SSEEvent<TStreamData>[]) =>
    queryClient.setQueryData<TQueryData>(queryKey, (current) =>
      events.reduce<TQueryData | undefined>((merged, e) => mapperRef.current(merged, e), current),
    );

  useSubscription<TStreamData>(subscribeFn, groupName, options.subscriptionMethod, {
    variables: options.subscriptionVariables ?? variables,
    enabled,
    onData: (event) => {
      const pending = held.current.events;
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
    if (queryResult.data === undefined || held.current.events.length === 0) return;
    merge(take());
  });

  return queryResult;
}
