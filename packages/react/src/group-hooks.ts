"use client";

import type { CallOptions, HTTPError, HTTPExecutor } from "@noverax/courier";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";

import type { ChannelFn } from "./hooks/use-channel";
import { useChannel as useChannelHook } from "./hooks/use-channel";
import {
  type UseComputedQueryOptions,
  useComputedQuery as useComputedQueryHook,
} from "./hooks/use-computed-query";
import type { SubscribeFn } from "./hooks/use-subscription";
import { useSubscription as useSubscriptionHook } from "./hooks/use-subscription";
import type { QueryGroupClient } from "./types";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildQueryKey(
  source: string,
  group: string,
  method: string,
  variables?: unknown,
): QueryKey {
  return variables !== undefined ? [source, group, method, variables] : [source, group, method];
}

// ---------------------------------------------------------------------------
// Group hooks factory
// ---------------------------------------------------------------------------

export function createGroupHooks(
  source: string,
  groupName: string,
  httpExecutor: HTTPExecutor,
  subscribeFn: SubscribeFn,
  channelFn: ChannelFn,
): QueryGroupClient<any> {
  const exec = (method: string, variables: unknown, requestOptions?: CallOptions) =>
    httpExecutor(
      groupName,
      method,
      variables,
      (requestOptions ?? {}) as Record<string, unknown>,
      false,
    );

  return {
    useQuery(method: string, ...args: [options?: Record<string, unknown>]) {
      const { variables, requestOptions, ...queryOptions } = args[0] ?? {};

      return useQuery({
        queryKey: buildQueryKey(source, groupName, method, variables),
        queryFn: () => exec(method, variables, requestOptions as CallOptions),
        ...queryOptions,
      });
    },

    useSuspenseQuery(method: string, ...args: [options?: Record<string, unknown>]) {
      const { variables, requestOptions, ...queryOptions } = args[0] ?? {};

      return useSuspenseQuery({
        queryKey: buildQueryKey(source, groupName, method, variables),
        queryFn: () => exec(method, variables, requestOptions as CallOptions),
        ...queryOptions,
      });
    },

    useInfiniteQuery(method: string, options: Record<string, unknown>) {
      const {
        variables,
        requestOptions,
        initialPageParam,
        getNextPageParam,
        getPreviousPageParam,
        ...infiniteOptions
      } = options;

      return useInfiniteQuery({
        queryKey: buildQueryKey(source, groupName, method),
        queryFn: ({ pageParam }) => {
          const vars = typeof variables === "function" ? variables(pageParam) : variables;
          return exec(method, vars, requestOptions as CallOptions);
        },
        initialPageParam,
        getNextPageParam: getNextPageParam as (...args: unknown[]) => unknown,
        getPreviousPageParam: getPreviousPageParam as ((...args: unknown[]) => unknown) | undefined,
        ...infiniteOptions,
      });
    },

    useMutation(method: string, options?: Record<string, unknown>) {
      const qc = useQueryClient();
      const {
        requestOptions,
        invalidate,
        onSettled: userOnSettled,
        ...mutationOptions
      } = options ?? {};

      return useMutation<unknown, HTTPError, unknown>({
        mutationFn: (variables: unknown) =>
          exec(method, variables ?? undefined, requestOptions as CallOptions),
        ...mutationOptions,
        onSettled:
          invalidate || userOnSettled
            ? (...args: unknown[]) => {
                if (invalidate) {
                  for (const key of invalidate as QueryKey[]) {
                    qc.invalidateQueries({ queryKey: key });
                  }
                }
                (userOnSettled as ((...a: unknown[]) => void) | undefined)?.(...args);
              }
            : undefined,
      });
    },

    async prefetchQuery(
      queryClient: QueryClient,
      method: string,
      ...args: [options?: Record<string, unknown>]
    ) {
      const { variables, requestOptions, staleTime } = args[0] ?? {};

      await queryClient.prefetchQuery({
        queryKey: buildQueryKey(source, groupName, method, variables),
        queryFn: () => exec(method, variables, requestOptions as CallOptions),
        staleTime: staleTime as number | undefined,
      });
    },

    useSubscription(method: string, options?: Record<string, unknown>) {
      return useSubscriptionHook(subscribeFn, groupName, method, options);
    },

    useComputedQuery(method: string, options: UseComputedQueryOptions<unknown, unknown, unknown>) {
      const requestOptions = (options as { requestOptions?: CallOptions }).requestOptions;
      return useComputedQueryHook(
        (vars) => exec(method, vars, requestOptions),
        subscribeFn,
        buildQueryKey(source, groupName, method, options.variables),
        groupName,
        options,
      );
    },

    useChannel(method: string, options?: Record<string, unknown>) {
      return useChannelHook(channelFn, groupName, method, options);
    },
  };
}
