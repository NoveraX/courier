import type { CallOptions } from "@noverax/courier";
import type { QueryClient } from "@tanstack/react-query";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";

import type { GroupCall, HookOptions } from "./group-call";
import {
  type UseComputedQueryOptions,
  useComputedQuery as useComputedQueryHook,
} from "./hooks/use-computed-query";
import type { SubscribeFn } from "./hooks/use-subscription";
import { buildInfiniteQueryKey, buildQueryKey } from "./query-key";
import { QUERY_RETRIES, retryUnlessCancelled } from "./retry-unless-cancelled";
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
      const queryKey = keyOf(method, variables);
      const queryClient = useQueryClient();
      return useQuery({
        queryKey,
        queryFn: ({ signal }) => call.fetch(method, variables, requestOptions, signal),
        ...queryOptions,
        retry: retryUnlessCancelled(
          queryClient,
          queryKey,
          queryOptions.retry,
          requestOptions?.signal,
          QUERY_RETRIES,
        ),
      });
    },

    useSuspenseQuery(method: string, options?: HookOptions) {
      const { variables, requestOptions, ...queryOptions } = options ?? {};
      const queryKey = keyOf(method, variables);
      const queryClient = useQueryClient();
      return useSuspenseQuery({
        queryKey,
        queryFn: ({ signal }) => call.fetch(method, variables, requestOptions, signal),
        ...queryOptions,
        retry: retryUnlessCancelled(
          queryClient,
          queryKey,
          queryOptions.retry,
          requestOptions?.signal,
          QUERY_RETRIES,
        ),
      });
    },

    useInfiniteQuery(method: string, options: InfiniteHookOptions) {
      const { variables, requestOptions, initialPageParam, ...infiniteOptions } = options;
      const variablesFor = (pageParam: unknown) => variables?.(pageParam);
      const queryKey = buildInfiniteQueryKey(
        source,
        groupName,
        method,
        variablesFor(initialPageParam),
      );
      const queryClient = useQueryClient();
      return useInfiniteQuery({
        queryKey,
        queryFn: ({ pageParam, signal }) =>
          call.fetch(method, variablesFor(pageParam), requestOptions, signal),
        initialPageParam,
        ...infiniteOptions,
        retry: retryUnlessCancelled(
          queryClient,
          queryKey,
          infiniteOptions.retry,
          requestOptions?.signal,
          QUERY_RETRIES,
        ),
      });
    },

    async prefetchQuery(queryClient: QueryClient, method: string, options?: HookOptions) {
      const { variables, requestOptions, staleTime } = options ?? {};
      const queryKey = keyOf(method, variables);
      await queryClient.prefetchQuery({
        queryKey,
        queryFn: ({ signal }) => call.fetch(method, variables, requestOptions, signal),
        ...(typeof staleTime === "number" && { staleTime }),
        /* A prefetch, unlike a query, is sent once unless the client says otherwise. */
        retry: retryUnlessCancelled(
          queryClient,
          queryKey,
          undefined,
          requestOptions?.signal,
          false,
        ),
      });
    },

    useComputedQuery(method: string, options: UseComputedQueryOptions<unknown, unknown>) {
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
