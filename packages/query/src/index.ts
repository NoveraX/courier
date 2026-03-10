"use client";

export {
  dehydrate,
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
export { createQueryKeys } from "./keys";

import {
  type CallOptions,
  createProxyCallerFn,
  type HTTPError,
  type ProxyCallerDefaults,
} from "@noverax/nexus";
import type { DefinedApi, Endpoint } from "@noverax/nexus/define";
import {
  type InfiniteData,
  type QueryClient as QueryClientType,
  type QueryKey,
  type UseInfiniteQueryOptions,
  type UseInfiniteQueryResult,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
  type UseSuspenseQueryOptions,
  type UseSuspenseQueryResult,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

type WithVariables<V> = [V] extends [undefined] ? { variables?: undefined } : { variables: V };

type GroupMethodKeys<G> = Exclude<keyof G, "options"> & string;

// ---------------------------------------------------------------------------
// Exported option types
// ---------------------------------------------------------------------------

export type NexusQueryOptions<R, V> = WithVariables<V> &
  Omit<UseQueryOptions<R, HTTPError, R, QueryKey>, "queryKey" | "queryFn"> & {
    requestOptions?: CallOptions;
  };

export type NexusSuspenseQueryOptions<R, V> = WithVariables<V> &
  Omit<UseSuspenseQueryOptions<R, HTTPError, R, QueryKey>, "queryKey" | "queryFn"> & {
    requestOptions?: CallOptions;
  };

export type NexusInfiniteQueryOptions<R, V, P> = {
  requestOptions?: CallOptions;
  initialPageParam: P;
  getNextPageParam: (
    lastPage: R,
    allPages: R[],
    lastPageParam: P,
    allPageParams: P[],
  ) => P | undefined | null;
  getPreviousPageParam?: (
    firstPage: R,
    allPages: R[],
    firstPageParam: P,
    allPageParams: P[],
  ) => P | undefined | null;
} & ([V] extends [undefined]
  ? { variables?: (pageParam: P) => V }
  : { variables: (pageParam: P) => V }) &
  Omit<
    UseInfiniteQueryOptions<R, HTTPError, InfiniteData<R, P>, QueryKey, P>,
    "queryKey" | "queryFn" | "initialPageParam" | "getNextPageParam" | "getPreviousPageParam"
  >;

export type NexusMutationOptions<R, V> = Omit<
  UseMutationOptions<R, HTTPError, [V] extends [undefined] ? void : V>,
  "mutationFn"
> & {
  requestOptions?: CallOptions;
  /** Query keys to automatically invalidate on mutation success. */
  invalidate?: QueryKey[];
};

export type NexusPrefetchOptions<V> = [V] extends [undefined]
  ? { variables?: undefined; requestOptions?: CallOptions; staleTime?: number }
  : { variables: V; requestOptions?: CallOptions; staleTime?: number };

// ---------------------------------------------------------------------------
// QueryGroupClient & QueryCallerClient types
// ---------------------------------------------------------------------------

/** Hooks and utilities exposed per API group */
export type QueryGroupClient<G> = {
  useQuery: <M extends GroupMethodKeys<G>>(
    method: M,
    ...args: G[M] extends Endpoint<infer R, infer V>
      ? [V] extends [undefined]
        ? [options?: NexusQueryOptions<R, V>]
        : [options: NexusQueryOptions<R, V>]
      : [options?: Record<string, unknown>]
  ) => G[M] extends Endpoint<infer R, any>
    ? UseQueryResult<R, HTTPError>
    : UseQueryResult<unknown, HTTPError>;

  useSuspenseQuery: <M extends GroupMethodKeys<G>>(
    method: M,
    ...args: G[M] extends Endpoint<infer R, infer V>
      ? [V] extends [undefined]
        ? [options?: NexusSuspenseQueryOptions<R, V>]
        : [options: NexusSuspenseQueryOptions<R, V>]
      : [options?: Record<string, unknown>]
  ) => G[M] extends Endpoint<infer R, any>
    ? UseSuspenseQueryResult<R, HTTPError>
    : UseSuspenseQueryResult<unknown, HTTPError>;

  useInfiniteQuery: <M extends GroupMethodKeys<G>, P>(
    method: M,
    options: G[M] extends Endpoint<infer R, infer V> ? NexusInfiniteQueryOptions<R, V, P> : never,
  ) => G[M] extends Endpoint<infer R, any>
    ? UseInfiniteQueryResult<InfiniteData<R, P>, HTTPError>
    : never;

  useMutation: <M extends GroupMethodKeys<G>>(
    method: M,
    options?: G[M] extends Endpoint<infer R, infer V> ? NexusMutationOptions<R, V> : never,
  ) => G[M] extends Endpoint<infer R, infer V>
    ? UseMutationResult<R, HTTPError, [V] extends [undefined] ? void : V>
    : never;

  prefetchQuery: <M extends GroupMethodKeys<G>>(
    queryClient: QueryClientType,
    method: M,
    ...args: G[M] extends Endpoint<any, infer V>
      ? [V] extends [undefined]
        ? [options?: NexusPrefetchOptions<V>]
        : [options: NexusPrefetchOptions<V>]
      : [options?: Record<string, unknown>]
  ) => Promise<void>;
};

/** Top-level query client with group-based dot-notation access */
export type QueryCallerClient<T extends DefinedApi<any>> = {
  [K in keyof T["options"]["groups"]]: QueryGroupClient<T["options"]["groups"][K]>;
};

// ---------------------------------------------------------------------------
// Optimistic update helper
// ---------------------------------------------------------------------------

export type OptimisticConfig<CacheData, MutationVars> = {
  queryKey: QueryKey;
  updater: (current: CacheData | undefined, variables: MutationVars) => CacheData;
};

/**
 * Generates `onMutate` / `onError` / `onSettled` callbacks for optimistic updates.
 * Spread the result into mutation options.
 *
 * @example
 * ```ts
 * const qc = useQueryClient();
 * q.users.useMutation("create", {
 *   ...optimisticOptions(qc, {
 *     queryKey: key("users", "getAll"),
 *     updater: (old, vars) => [...(old ?? []), { ...vars, id: "temp" }],
 *   }),
 * });
 * ```
 */
export function optimisticOptions<CacheData, MutationVars>(
  queryClient: QueryClientType,
  config: OptimisticConfig<CacheData, MutationVars>,
) {
  return {
    onMutate: async (variables: MutationVars) => {
      await queryClient.cancelQueries({ queryKey: config.queryKey });
      const previous = queryClient.getQueryData<CacheData>(config.queryKey);
      queryClient.setQueryData<CacheData>(config.queryKey, (old) => config.updater(old, variables));
      return { _previousData: previous };
    },
    onError: (
      _err: HTTPError,
      _vars: MutationVars,
      context: { _previousData?: CacheData } | undefined,
    ) => {
      if (context?._previousData !== undefined) {
        queryClient.setQueryData(config.queryKey, context._previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: config.queryKey });
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

  function buildQueryKey(group: string, method: string, variables?: unknown): QueryKey {
    return variables !== undefined ? [source, group, method, variables] : [source, group, method];
  }

  function createGroupHooks(groupName: string): QueryGroupClient<any> {
    function executeEndpoint(method: string, variables: unknown, requestOptions?: CallOptions) {
      const execute = (callerFn as any)(source, requestOptions);
      const endpoint = `${groupName}:${method}`;
      return variables !== undefined ? execute(endpoint, variables) : execute(endpoint);
    }

    return {
      useQuery(method: string, ...args: [options?: any]) {
        const { variables, requestOptions, ...queryOptions } = args[0] ?? {};

        return useQuery({
          queryKey: buildQueryKey(groupName, method, variables),
          queryFn: () => executeEndpoint(method, variables, requestOptions),
          ...queryOptions,
        });
      },

      useSuspenseQuery(method: string, ...args: [options?: any]) {
        const { variables, requestOptions, ...queryOptions } = args[0] ?? {};

        return useSuspenseQuery({
          queryKey: buildQueryKey(groupName, method, variables),
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
          queryKey: buildQueryKey(groupName, method),
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

      async prefetchQuery(queryClient: QueryClientType, method: string, ...args: [options?: any]) {
        const { variables, requestOptions, staleTime } = args[0] ?? {};

        await queryClient.prefetchQuery({
          queryKey: buildQueryKey(groupName, method, variables),
          queryFn: () => executeEndpoint(method, variables, requestOptions),
          staleTime,
        });
      },
    };
  }

  return new Proxy(Object.create(null), {
    get(_, prop) {
      if (typeof prop === "symbol") return undefined;
      if (prop === "then" || prop === "toJSON" || prop === "valueOf" || prop === "$$typeof") {
        return undefined;
      }

      const key = prop as string;
      if (!groupCache.has(key)) {
        groupCache.set(key, createGroupHooks(key));
      }
      return groupCache.get(key);
    },
  }) as QueryCallerClient<T>;
}
