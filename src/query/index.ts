"use client";

export { QueryClient, QueryClientProvider } from "@tanstack/react-query";
export { createQueryKeys } from "./keys";

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
import { type ClientRequestDefaults, createClientRequest } from "../create";
import type { Endpoint } from "../define/types";
import type { HTTPError } from "../error";
import type { CallOptions } from "../instance/types";
import type { EndpointKey, ResolveEndpoint } from "../types";

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

type InferResponse<M> = M extends Endpoint<infer R, any> ? R : unknown;
type InferVariables<M> = M extends Endpoint<any, infer V> ? V : undefined;

type WithVariables<V> = [V] extends [undefined] ? { variables?: undefined } : { variables: V };

// Non-conditional versions for safe destructuring inside generic function bodies
type QueryOptionsInternal<R, V> = {
  variables?: V;
  requestOptions?: CallOptions;
} & Omit<UseQueryOptions<R, HTTPError, R, QueryKey>, "queryKey" | "queryFn">;

type SuspenseOptionsInternal<R, V> = {
  variables?: V;
  requestOptions?: CallOptions;
} & Omit<UseSuspenseQueryOptions<R, HTTPError, R, QueryKey>, "queryKey" | "queryFn">;

type InfiniteOptionsInternal<R, V, P> = {
  variables?: V | ((pageParam: P) => V);
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
} & Omit<
  UseInfiniteQueryOptions<R, HTTPError, InfiniteData<R, P>, QueryKey, P>,
  "queryKey" | "queryFn" | "initialPageParam" | "getNextPageParam" | "getPreviousPageParam"
>;

type MutationOptionsInternal<R, V> = {
  requestOptions?: CallOptions;
  invalidate?: QueryKey[];
  onSettled?: (...args: any[]) => any;
} & Omit<
  UseMutationOptions<R, HTTPError, [V] extends [undefined] ? void : V>,
  "mutationFn" | "onSettled"
>;

type PrefetchOptionsInternal<V> = {
  variables?: V;
  requestOptions?: CallOptions;
  staleTime?: number;
};

// Curried execute shape — TS cannot infer RequestFn's nested generics through closures
type ExecuteFn<R> = (endpoint: string, variables?: unknown) => Promise<R>;

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
 * useMutation("api", "users:create", {
 *   ...optimisticOptions(qc, {
 *     queryKey: key("api", "users:getAll"),
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

export function createQueryRequest<T extends Record<string, any> = Record<string, any>>(
  defaults?: ClientRequestDefaults,
) {
  const client = createClientRequest<T>(defaults);

  function buildQueryKey(source: string, endpoint: string, variables?: unknown): QueryKey {
    return variables !== undefined ? [source, endpoint, variables] : [source, endpoint];
  }

  // ---- useQuery ----------------------------------------------------------

  function useNexusQuery<
    K extends keyof T & string,
    Q extends EndpointKey<T[K]>,
    M = ResolveEndpoint<T[K], Q>,
    R = InferResponse<M extends Endpoint<any, any> ? M : never>,
    V = InferVariables<M extends Endpoint<any, any> ? M : never>,
  >(
    source: K,
    endpoint: Q,
    ...args: [V] extends [undefined]
      ? [options?: NexusQueryOptions<R, V>]
      : [options: NexusQueryOptions<R, V>]
  ): UseQueryResult<R, HTTPError> {
    const { variables, requestOptions, ...queryOptions } = (args[0] ?? {}) as QueryOptionsInternal<
      R,
      V
    >;

    return useQuery<R, HTTPError>({
      queryKey: buildQueryKey(source, endpoint, variables),
      queryFn: () => {
        const execute = client(source, requestOptions) as ExecuteFn<R>;
        return variables !== undefined ? execute(endpoint, variables) : execute(endpoint);
      },
      ...queryOptions,
    });
  }

  // ---- useSuspenseQuery --------------------------------------------------

  function useNexusSuspenseQuery<
    K extends keyof T & string,
    Q extends EndpointKey<T[K]>,
    M = ResolveEndpoint<T[K], Q>,
    R = InferResponse<M extends Endpoint<any, any> ? M : never>,
    V = InferVariables<M extends Endpoint<any, any> ? M : never>,
  >(
    source: K,
    endpoint: Q,
    ...args: [V] extends [undefined]
      ? [options?: NexusSuspenseQueryOptions<R, V>]
      : [options: NexusSuspenseQueryOptions<R, V>]
  ): UseSuspenseQueryResult<R, HTTPError> {
    const { variables, requestOptions, ...queryOptions } = (args[0] ??
      {}) as SuspenseOptionsInternal<R, V>;

    return useSuspenseQuery<R, HTTPError>({
      queryKey: buildQueryKey(source, endpoint, variables),
      queryFn: () => {
        const execute = client(source, requestOptions) as ExecuteFn<R>;
        return variables !== undefined ? execute(endpoint, variables) : execute(endpoint);
      },
      ...queryOptions,
    });
  }

  // ---- useInfiniteQuery --------------------------------------------------

  function useNexusInfiniteQuery<
    K extends keyof T & string,
    Q extends EndpointKey<T[K]>,
    PageParam,
    M = ResolveEndpoint<T[K], Q>,
    R = InferResponse<M extends Endpoint<any, any> ? M : never>,
    V = InferVariables<M extends Endpoint<any, any> ? M : never>,
  >(
    source: K,
    endpoint: Q,
    options: NexusInfiniteQueryOptions<R, V, PageParam>,
  ): UseInfiniteQueryResult<InfiniteData<R, PageParam>, HTTPError> {
    const {
      variables,
      requestOptions,
      initialPageParam,
      getNextPageParam,
      getPreviousPageParam,
      ...infiniteOptions
    } = options as InfiniteOptionsInternal<R, V, PageParam>;

    return useInfiniteQuery<R, HTTPError, InfiniteData<R, PageParam>, QueryKey, PageParam>({
      queryKey: buildQueryKey(source, endpoint),
      queryFn: ({ pageParam }) => {
        const pp = pageParam as PageParam;
        const vars =
          typeof variables === "function" ? (variables as (p: PageParam) => V)(pp) : variables;
        const execute = client(source, requestOptions) as ExecuteFn<R>;
        return vars !== undefined ? execute(endpoint, vars) : execute(endpoint);
      },
      initialPageParam,
      getNextPageParam,
      getPreviousPageParam,
      ...infiniteOptions,
    });
  }

  // ---- useMutation (with auto-invalidation) -----------------------------

  function useNexusMutation<
    K extends keyof T & string,
    Q extends EndpointKey<T[K]>,
    M = ResolveEndpoint<T[K], Q>,
    R = InferResponse<M extends Endpoint<any, any> ? M : never>,
    V = InferVariables<M extends Endpoint<any, any> ? M : never>,
  >(
    source: K,
    endpoint: Q,
    options?: NexusMutationOptions<R, V>,
  ): UseMutationResult<R, HTTPError, [V] extends [undefined] ? void : V> {
    const queryClient = useQueryClient();
    const {
      requestOptions,
      invalidate,
      onSettled: userOnSettled,
      ...mutationOptions
    } = (options ?? {}) as MutationOptionsInternal<R, V>;

    return useMutation<R, HTTPError, [V] extends [undefined] ? void : V>({
      mutationFn: (variables) => {
        const execute = client(source, requestOptions) as ExecuteFn<R>;
        return variables != null ? execute(endpoint, variables) : execute(endpoint);
      },
      ...mutationOptions,
      onSettled:
        invalidate || userOnSettled
          ? (...args: any[]) => {
              if (invalidate) {
                for (const key of invalidate) {
                  queryClient.invalidateQueries({ queryKey: key });
                }
              }
              userOnSettled?.(...args);
            }
          : undefined,
    });
  }

  // ---- prefetchQuery (non-hook, for SSR / client prefetch) ---------------

  async function prefetchNexusQuery<
    K extends keyof T & string,
    Q extends EndpointKey<T[K]>,
    M = ResolveEndpoint<T[K], Q>,
    R = InferResponse<M extends Endpoint<any, any> ? M : never>,
    V = InferVariables<M extends Endpoint<any, any> ? M : never>,
  >(
    queryClient: QueryClientType,
    source: K,
    endpoint: Q,
    ...args: [V] extends [undefined]
      ? [options?: NexusPrefetchOptions<V>]
      : [options: NexusPrefetchOptions<V>]
  ): Promise<void> {
    const { variables, requestOptions, staleTime } = (args[0] ?? {}) as PrefetchOptionsInternal<V>;

    await queryClient.prefetchQuery({
      queryKey: buildQueryKey(source, endpoint, variables),
      queryFn: () => {
        const execute = client(source, requestOptions) as ExecuteFn<R>;
        return variables !== undefined ? execute(endpoint, variables) : execute(endpoint);
      },
      staleTime,
    });
  }

  return {
    useQuery: useNexusQuery,
    useSuspenseQuery: useNexusSuspenseQuery,
    useInfiniteQuery: useNexusInfiniteQuery,
    useMutation: useNexusMutation,
    prefetchQuery: prefetchNexusQuery,
    request: client,
  };
}
