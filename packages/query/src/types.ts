import type { CallOptions, HTTPError } from "@noverax/nexus";
import type { DefinedApi, Endpoint } from "@noverax/nexus/define";
import type {
  InfiniteData,
  QueryClient,
  QueryKey,
  UseInfiniteQueryOptions,
  UseInfiniteQueryResult,
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
  UseSuspenseQueryOptions,
  UseSuspenseQueryResult,
} from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Internal type helpers
// ---------------------------------------------------------------------------

export type WithVariables<V> = [V] extends [undefined]
  ? { variables?: undefined }
  : {} extends V
    ? { variables?: V }
    : { variables: V };

/** Resolve TVariables for react-query mutations: void when no args needed */
// biome-ignore lint/suspicious/noConfusingVoidType: void is required for react-query's mutate() to accept zero arguments
export type MutationVariables<V> = [V] extends [undefined] ? void : {} extends V ? void | V : V;

export type GroupMethodKeys<G> = Exclude<keyof G, "options"> & string;

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
  : {} extends V
    ? { variables?: (pageParam: P) => V }
    : { variables: (pageParam: P) => V }) &
  Omit<
    UseInfiniteQueryOptions<R, HTTPError, InfiniteData<R, P>, QueryKey, P>,
    "queryKey" | "queryFn" | "initialPageParam" | "getNextPageParam" | "getPreviousPageParam"
  >;

export type NexusMutationOptions<R, V> = Omit<
  UseMutationOptions<R, HTTPError, MutationVariables<V>>,
  "mutationFn"
> & {
  requestOptions?: CallOptions;
  /** Query keys to automatically invalidate on mutation success. */
  invalidate?: QueryKey[];
};

export type NexusPrefetchOptions<V> = [V] extends [undefined]
  ? { variables?: undefined; requestOptions?: CallOptions; staleTime?: number }
  : {} extends V
    ? { variables?: V; requestOptions?: CallOptions; staleTime?: number }
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
        : {} extends V
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
        : {} extends V
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
    ? UseMutationResult<R, HTTPError, MutationVariables<V>>
    : never;

  prefetchQuery: <M extends GroupMethodKeys<G>>(
    queryClient: QueryClient,
    method: M,
    ...args: G[M] extends Endpoint<any, infer V>
      ? [V] extends [undefined]
        ? [options?: NexusPrefetchOptions<V>]
        : {} extends V
          ? [options?: NexusPrefetchOptions<V>]
          : [options: NexusPrefetchOptions<V>]
      : [options?: Record<string, unknown>]
  ) => Promise<void>;
};

/** Top-level query client with group-based dot-notation access */
export type QueryCallerClient<T extends DefinedApi<any>> = {
  [K in keyof T["options"]["groups"]]: QueryGroupClient<T["options"]["groups"][K]>;
};
