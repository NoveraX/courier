/**
 * Hook option types for Courier react-query integration.
 *
 * Describes the `options` argument shape for `useQuery`, `useSuspenseQuery`,
 * `useInfiniteQuery`, `useMutation`, `prefetchQuery` and `useComputedQuery`
 * hooks exposed by `QueryGroupClient`.
 */

import type { CallOptions } from "@noverax/courier";
import type { ConnectionStatus, SSEEvent } from "@noverax/courier/realtime";
import type {
  InfiniteData,
  QueryKey,
  UseInfiniteQueryOptions,
  UseMutationOptions,
  UseQueryOptions,
  UseSuspenseQueryOptions,
} from "@tanstack/react-query";

import type { MayOmitVariables, MutationVariables, WithVariables } from "./types-helpers";

/** `TData` is what the hook returns: the response, or what `select` makes of it. */
export type CourierQueryOptions<
  TResponse,
  TVariables,
  TData = TResponse,
> = WithVariables<TVariables> &
  Omit<UseQueryOptions<TResponse, Error, TData, QueryKey>, "queryKey" | "queryFn"> & {
    requestOptions?: CallOptions;
  };

/** `TData` is what the hook returns: the response, or what `select` makes of it. */
export type CourierSuspenseQueryOptions<
  TResponse,
  TVariables,
  TData = TResponse,
> = WithVariables<TVariables> &
  Omit<UseSuspenseQueryOptions<TResponse, Error, TData, QueryKey>, "queryKey" | "queryFn"> & {
    requestOptions?: CallOptions;
  };

export type CourierInfiniteQueryOptions<TResponse, TVariables, TPageParam> = {
  requestOptions?: CallOptions;
  initialPageParam: TPageParam;
  getNextPageParam: (
    lastPage: TResponse,
    allPages: TResponse[],
    lastPageParam: TPageParam,
    allPageParams: TPageParam[],
  ) => TPageParam | undefined | null;
  getPreviousPageParam?: (
    firstPage: TResponse,
    allPages: TResponse[],
    firstPageParam: TPageParam,
    allPageParams: TPageParam[],
  ) => TPageParam | undefined | null;
  // biome-ignore lint/suspicious/noConfusingVoidType: void is the builder's sentinel for an endpoint that takes no variables
} & ([TVariables] extends [undefined | void]
  ? { variables?: (pageParam: TPageParam) => TVariables }
  : MayOmitVariables<TVariables> extends true
    ? { variables?: (pageParam: TPageParam) => TVariables }
    : { variables: (pageParam: TPageParam) => TVariables }) &
  Omit<
    UseInfiniteQueryOptions<
      TResponse,
      Error,
      InfiniteData<TResponse, TPageParam>,
      QueryKey,
      TPageParam
    >,
    "queryKey" | "queryFn" | "initialPageParam" | "getNextPageParam" | "getPreviousPageParam"
  >;

export type CourierMutationOptions<TResponse, TVariables> = Omit<
  UseMutationOptions<TResponse, Error, MutationVariables<TVariables>>,
  "mutationFn"
> & {
  requestOptions?: CallOptions;
  /**
   * Query keys to invalidate once the mutation has succeeded — not after a
   * failure. The mutation stays pending until their refetch is done.
   */
  invalidate?: QueryKey[];
};

// biome-ignore lint/suspicious/noConfusingVoidType: void is the builder's sentinel for an endpoint that takes no variables
export type CourierPrefetchOptions<TVariables> = [TVariables] extends [undefined | void]
  ? { variables?: undefined; requestOptions?: CallOptions; staleTime?: number }
  : MayOmitVariables<TVariables> extends true
    ? { variables?: TVariables; requestOptions?: CallOptions; staleTime?: number }
    : { variables: TVariables; requestOptions?: CallOptions; staleTime?: number };

/**
 * `TStream` is the stream named by `subscriptionMethod` and `TStreamData`
 * what each of its events carries.
 */
export type CourierComputedQueryOptions<
  TQueryResponse,
  TStreamData,
  TVariables,
  TStream extends string = string,
> = WithVariables<TVariables> & {
  /** SSE endpoint method name (on the same group) that provides live updates */
  subscriptionMethod: TStream;
  /** Variables for the SSE subscription (defaults to query variables) */
  subscriptionVariables?: unknown;
  /** Merge each stream event into the cached query data */
  mapper: (current: TQueryResponse | undefined, event: SSEEvent<TStreamData>) => TQueryResponse;
  /** Disable both query and subscription (default: true) */
  enabled?: boolean;
  /** react-query staleTime */
  staleTime?: number;
  /** Per-request options for the HTTP query */
  requestOptions?: CallOptions;
  /**
   * Called when the stream fails or is refused, or cannot be opened at all;
   * the query keeps its last data and goes on without live updates
   */
  onStreamError?: (error: Error) => void;
  /** Called when the stream's connection status changes */
  onStreamStatusChange?: (status: ConnectionStatus) => void;
};
