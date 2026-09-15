"use client";

import type { HTTPError } from "@noverax/courier";
import type { SSEEvent } from "@noverax/courier/realtime";
import type { QueryKey, UseQueryResult } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SubscribeFn } from "./use-subscription";
import { useSubscription } from "./use-subscription";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Combines a standard HTTP query with an SSE subscription that auto-updates
 * the query cache on each event via the provided mapper function.
 *
 * @param queryFn - Factory that executes the HTTP endpoint
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
  queryFn: (variables: unknown) => Promise<unknown>,
  subscribeFn: SubscribeFn,
  queryKey: QueryKey,
  groupName: string,
  options: UseComputedQueryOptions<TQueryData, TStreamData, unknown>,
): UseQueryResult<TQueryData, HTTPError> {
  const { variables, enabled = true, staleTime } = options;
  const queryClient = useQueryClient();

  const queryResult = useQuery<TQueryData, HTTPError>({
    queryKey,
    queryFn: () => queryFn(variables) as Promise<TQueryData>,
    enabled,
    staleTime,
  });

  useSubscription<TStreamData>(subscribeFn, groupName, options.subscriptionMethod, {
    variables: options.subscriptionVariables ?? variables,
    enabled,
    onData: (event) => {
      queryClient.setQueryData<TQueryData>(queryKey, (current) => options.mapper(current, event));
    },
  });

  return queryResult;
}
