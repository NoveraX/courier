"use client";

import { type CallOptions, createProxyCallerFn, type ProxyCallerDefaults } from "@noverax/nexus";
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
  callerFn: ReturnType<typeof createProxyCallerFn>,
): QueryGroupClient<any> {
  function executeEndpoint(method: string, variables: unknown, requestOptions?: CallOptions) {
    const execute = (callerFn as any)(source, requestOptions);
    const endpoint = `${groupName}:${method}`;
    return variables !== undefined ? execute(endpoint, variables) : execute(endpoint);
  }

  return {
    useQuery(method: string, ...args: [options?: any]) {
      const { variables, requestOptions, ...queryOptions } = args[0] ?? {};

      return useQuery({
        queryKey: buildQueryKey(source, groupName, method, variables),
        queryFn: () => executeEndpoint(method, variables, requestOptions),
        ...queryOptions,
      });
    },

    useSuspenseQuery(method: string, ...args: [options?: any]) {
      const { variables, requestOptions, ...queryOptions } = args[0] ?? {};

      return useSuspenseQuery({
        queryKey: buildQueryKey(source, groupName, method, variables),
        queryFn: () => executeEndpoint(method, variables, requestOptions),
        ...queryOptions,
      });
    },

    useInfiniteQuery(method: string, options: any) {
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
          return executeEndpoint(method, vars, requestOptions);
        },
        initialPageParam,
        getNextPageParam,
        getPreviousPageParam,
        ...infiniteOptions,
      });
    },

    useMutation(method: string, options?: any) {
      const qc = useQueryClient();
      const {
        requestOptions,
        invalidate,
        onSettled: userOnSettled,
        ...mutationOptions
      } = options ?? {};

      return useMutation({
        mutationFn: (variables: any) =>
          executeEndpoint(method, variables != null ? variables : undefined, requestOptions),
        ...mutationOptions,
        onSettled:
          invalidate || userOnSettled
            ? (...args: any[]) => {
                if (invalidate) {
                  for (const key of invalidate) {
                    qc.invalidateQueries({ queryKey: key });
                  }
                }
                userOnSettled?.(...args);
              }
            : undefined,
      });
    },

    async prefetchQuery(queryClient: QueryClient, method: string, ...args: [options?: any]) {
      const { variables, requestOptions, staleTime } = args[0] ?? {};

      await queryClient.prefetchQuery({
        queryKey: buildQueryKey(source, groupName, method, variables),
        queryFn: () => executeEndpoint(method, variables, requestOptions),
        staleTime,
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
  const callerFn = createProxyCallerFn(defaults);
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
