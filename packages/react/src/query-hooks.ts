import type { CallOptions } from "@noverax/courier";
import type { QueryClient } from "@tanstack/react-query";
import { useInfiniteQuery, useQuery, useSuspenseQuery } from "@tanstack/react-query";

import type { GroupCall, HookOptions } from "./group-call";
import {
  type UseComputedQueryOptions,
  useComputedQuery as useComputedQueryHook,
} from "./hooks/use-computed-query";
import type { SubscribeFn } from "./hooks/use-subscription";
import { buildInfiniteQueryKey, buildQueryKey } from "./query-key";
import type { UntypedGroupHooks } from "./untyped-group-hooks";

type PageParamFn = (
  page: unknown,
  allPages: unknown[],
  pageParam: unknown,
  allPageParams: unknown[],
) => unknown;

interface InfiniteHookOptions extends Record<string, unknown> {
  variables?: (pageParam: unknown) => unknown;
  requestOptions?: CallOptions;
  initialPageParam: unknown;
  getNextPageParam: PageParamFn;
  getPreviousPageParam?: PageParamFn;
}

/** The hooks of a group that read an endpoint and keep its answer cached. */
export type QueryHooks = Pick<
  UntypedGroupHooks,
  "useQuery" | "useSuspenseQuery" | "useInfiniteQuery" | "prefetchQuery" | "useComputedQuery"
>;

/**
 * Build the query hooks of one group.
 *
 * @param source - Source name that starts every key
 * @param groupName - API group the hooks belong to
 * @param call - The group's HTTP calls
 * @param subscribeFn - Opens the stream `useComputedQuery` merges in
 * @returns `useQuery`, `useSuspenseQuery`, `useInfiniteQuery`, `prefetchQuery` and `useComputedQuery`
 * @example
 * const hooks = createQueryHooks("api", "users", createGroupCall("users", exec), subscribeFn);
 */
export function createQueryHooks(
  source: string,
  groupName: string,
  call: GroupCall,
  subscribeFn: SubscribeFn,
): QueryHooks {
  const keyOf = (method: string, variables: unknown) =>
    buildQueryKey(source, groupName, method, variables);

  return {
    useQuery(method: string, options?: HookOptions) {
      const { variables, requestOptions, ...queryOptions } = options ?? {};
      return useQuery({
        queryKey: keyOf(method, variables),
        queryFn: ({ signal }) => call.fetch(method, variables, requestOptions, signal),
        ...queryOptions,
      });
    },

    useSuspenseQuery(method: string, options?: HookOptions) {
      const { variables, requestOptions, ...queryOptions } = options ?? {};
      return useSuspenseQuery({
        queryKey: keyOf(method, variables),
        queryFn: ({ signal }) => call.fetch(method, variables, requestOptions, signal),
        ...queryOptions,
      });
    },

    useInfiniteQuery(method: string, options: InfiniteHookOptions) {
      const { variables, requestOptions, initialPageParam, ...infiniteOptions } = options;
      const variablesFor = (pageParam: unknown) => variables?.(pageParam);
      return useInfiniteQuery({
        queryKey: buildInfiniteQueryKey(source, groupName, method, variablesFor(initialPageParam)),
        queryFn: ({ pageParam, signal }) =>
          call.fetch(method, variablesFor(pageParam), requestOptions, signal),
        initialPageParam,
        ...infiniteOptions,
      });
    },

    async prefetchQuery(queryClient: QueryClient, method: string, options?: HookOptions) {
      const { variables, requestOptions, staleTime } = options ?? {};
      await queryClient.prefetchQuery({
        queryKey: keyOf(method, variables),
        queryFn: ({ signal }) => call.fetch(method, variables, requestOptions, signal),
        staleTime: typeof staleTime === "number" ? staleTime : undefined,
      });
    },

    useComputedQuery(method: string, options: UseComputedQueryOptions<unknown, unknown, unknown>) {
      return useComputedQueryHook(
        (variables, signal) => call.fetch(method, variables, options.requestOptions, signal),
        subscribeFn,
        keyOf(method, options.variables),
        groupName,
        options,
      );
    },
  } as QueryHooks;
}
