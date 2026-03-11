"use client";

import {
  type CallOptions,
  createProxyCallerFn,
  type HTTPError,
  type ProxyCallerDefaults,
  type UntypedCallerFn,
} from "@noverax/nexus";
import type { DefinedApi } from "@noverax/nexus/define";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";

import type { QueryCallerClient, QueryGroupClient } from "./types";

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

function createGroupHooks(
  source: string,
  groupName: string,
  callerFn: UntypedCallerFn,
): QueryGroupClient<any> {
  function executeEndpoint(
    method: string,
    variables: unknown,
    requestOptions?: CallOptions,
  ): Promise<unknown> {
    const execute = callerFn(source, requestOptions as Record<string, unknown>);
    const endpoint = `${groupName}:${method}`;
    return variables !== undefined ? execute(endpoint, variables) : execute(endpoint);
  }

  return {
    useQuery(method: string, ...args: [options?: Record<string, unknown>]) {
      const { variables, requestOptions, ...queryOptions } = args[0] ?? {};

      return useQuery({
        queryKey: buildQueryKey(source, groupName, method, variables),
        queryFn: () => executeEndpoint(method, variables, requestOptions as CallOptions),
        ...queryOptions,
      });
    },

    useSuspenseQuery(method: string, ...args: [options?: Record<string, unknown>]) {
      const { variables, requestOptions, ...queryOptions } = args[0] ?? {};

      return useSuspenseQuery({
        queryKey: buildQueryKey(source, groupName, method, variables),
        queryFn: () => executeEndpoint(method, variables, requestOptions as CallOptions),
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
          return executeEndpoint(method, vars, requestOptions as CallOptions);
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
          executeEndpoint(method, variables ?? undefined, requestOptions as CallOptions),
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
        queryFn: () => executeEndpoint(method, variables, requestOptions as CallOptions),
        staleTime: staleTime as number | undefined,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Main factory
// ---------------------------------------------------------------------------

/**
 * Create a query client with dot-notation access to react-query hooks per API group.
 *
 * @param source - Source name matching the key in server-side apiRoute({ [source]: ... })
 * @param defaults - Proxy configuration (proxyUrl, timeout, credentials, etc.)
 *
 * @example
 * ```ts
 * const q = createQueryCaller<typeof api>("api");
 *
 * // In components:
 * const { data } = q.users.useQuery("getAll");
 * const { data } = q.users.useQuery("getById", { variables: { id: 1 } });
 * const mutation = q.users.useMutation("create");
 *
 * // Destructuring works:
 * const { useQuery, useMutation } = q.users;
 * const { data } = useQuery("getAll");
 *
 * // SSR prefetch:
 * await q.users.prefetchQuery(queryClient, "getAll");
 * ```
 */
export function createQueryCaller<T extends DefinedApi<any>>(
  source: string,
  defaults?: ProxyCallerDefaults,
): QueryCallerClient<T> {
  const callerFn = createProxyCallerFn(defaults) as unknown as UntypedCallerFn;
  // biome-ignore lint/suspicious/noExplicitAny: cache stores untyped group hooks — typed via QueryCallerClient<T> proxy cast
  const groupCache = new Map<string, QueryGroupClient<any>>();

  return new Proxy(Object.create(null), {
    get(_, prop) {
      if (typeof prop === "symbol") return undefined;
      if (prop === "then" || prop === "toJSON" || prop === "valueOf" || prop === "$$typeof") {
        return undefined;
      }

      const key = prop as string;
      if (!groupCache.has(key)) {
        groupCache.set(key, createGroupHooks(source, key, callerFn));
      }
      return groupCache.get(key);
    },
  }) as QueryCallerClient<T>;
}
