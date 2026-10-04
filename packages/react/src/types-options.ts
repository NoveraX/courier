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
    requestOptions?: CallOptions | undefined;
  };

/** `TData` is what the hook returns: the response, or what `select` makes of it. */
export type CourierSuspenseQueryOptions<
  TResponse,
  TVariables,
  TData = TResponse,
> = WithVariables<TVariables> &
  Omit<UseSuspenseQueryOptions<TResponse, Error, TData, QueryKey>, "queryKey" | "queryFn"> & {
    requestOptions?: CallOptions | undefined;
  };

export type CourierInfiniteQueryOptions<TResponse, TVariables, TPageParam> = {
  requestOptions?: CallOptions | undefined;
  initialPageParam: TPageParam;
  getNextPageParam: (
    lastPage: TResponse,
    allPages: TResponse[],
    lastPageParam: TPageParam,
    allPageParams: TPageParam[],
  ) => TPageParam | undefined | null;
  getPreviousPageParam?:
    | ((
        firstPage: TResponse,
        allPages: TResponse[],
        firstPageParam: TPageParam,
        allPageParams: TPageParam[],
      ) => TPageParam | undefined | null)
    | undefined;
  // biome-ignore lint/suspicious/noConfusingVoidType: void is the builder's sentinel for an endpoint that takes no variables
} & ([TVariables] extends [undefined | void]
  ? { variables?: ((pageParam: TPageParam) => TVariables) | undefined }
  : MayOmitVariables<TVariables> extends true
    ? { variables?: ((pageParam: TPageParam) => TVariables) | undefined }
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

/**
 * `TOnMutateResult` is what `onMutate` returns — a snapshot to roll back to —
 * inferred from it and handed to `onError` and `onSettled` as it is typed.
 */
export type CourierMutationOptions<TResponse, TVariables, TOnMutateResult = unknown> = Omit<
  UseMutationOptions<TResponse, Error, MutationVariables<TVariables>, TOnMutateResult>,
  "mutationFn"
> & {
  requestOptions?: CallOptions | undefined;
  /**
   * Query keys to invalidate once the mutation has succeeded — not after a
   * failure. The mutation stays pending until their refetch is done.
   */
  invalidate?: QueryKey[] | undefined;
};

// biome-ignore lint/suspicious/noConfusingVoidType: void is the builder's sentinel for an endpoint that takes no variables
export type CourierPrefetchOptions<TVariables> = [TVariables] extends [undefined | void]
  ? {
      variables?: undefined;
      requestOptions?: CallOptions | undefined;
      staleTime?: number | undefined;
    }
  : MayOmitVariables<TVariables> extends true
    ? {
        variables?: TVariables | undefined;
        requestOptions?: CallOptions | undefined;
        staleTime?: number | undefined;
      }
    : {
        variables: TVariables;
        requestOptions?: CallOptions | undefined;
        staleTime?: number | undefined;
      };

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
  enabled?: boolean | undefined;
  /** react-query staleTime */
  staleTime?: number | undefined;
  /** Per-request options for the HTTP query */
  requestOptions?: CallOptions | undefined;
  /**
   * Called when the stream fails or is refused, or cannot be opened at all;
   * the query keeps its last data and goes on without live updates
   */
  onStreamError?: ((error: Error) => void) | undefined;
  /** Called when the stream's connection status changes */
  onStreamStatusChange?: ((status: ConnectionStatus) => void) | undefined;
};
