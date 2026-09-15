/**
 * Hook option types for Courier react-query integration.
 *
 * Describes the `options` argument shape for `useQuery`, `useSuspenseQuery`,
 * `useInfiniteQuery`, `useMutation`, `prefetchQuery` and `useComputedQuery`
 * hooks exposed by `QueryGroupClient`.
 */

import type { CallOptions, HTTPError } from "@noverax/courier";
import type { SSEEvent } from "@noverax/courier/realtime";
import type {
  InfiniteData,
  QueryKey,
  UseInfiniteQueryOptions,
  UseMutationOptions,
  UseQueryOptions,
  UseSuspenseQueryOptions,
} from "@tanstack/react-query";

import type { MutationVariables, WithVariables } from "./types-helpers";

export type CourierQueryOptions<TResponse, TVariables> = WithVariables<TVariables> &
  Omit<UseQueryOptions<TResponse, HTTPError, TResponse, QueryKey>, "queryKey" | "queryFn"> & {
    requestOptions?: CallOptions;
  };

export type CourierSuspenseQueryOptions<TResponse, TVariables> = WithVariables<TVariables> &
  Omit<
    UseSuspenseQueryOptions<TResponse, HTTPError, TResponse, QueryKey>,
    "queryKey" | "queryFn"
  > & {
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
} & ([TVariables] extends [undefined]
  ? { variables?: (pageParam: TPageParam) => TVariables }
  : {} extends TVariables
    ? { variables?: (pageParam: TPageParam) => TVariables }
    : { variables: (pageParam: TPageParam) => TVariables }) &
  Omit<
    UseInfiniteQueryOptions<
      TResponse,
      HTTPError,
      InfiniteData<TResponse, TPageParam>,
      QueryKey,
      TPageParam
    >,
    "queryKey" | "queryFn" | "initialPageParam" | "getNextPageParam" | "getPreviousPageParam"
  >;

export type CourierMutationOptions<TResponse, TVariables> = Omit<
  UseMutationOptions<TResponse, HTTPError, MutationVariables<TVariables>>,
  "mutationFn"
> & {
  requestOptions?: CallOptions;
  /** Query keys to automatically invalidate on mutation success. */
  invalidate?: QueryKey[];
};

export type CourierPrefetchOptions<TVariables> = [TVariables] extends [undefined]
  ? { variables?: undefined; requestOptions?: CallOptions; staleTime?: number }
  : {} extends TVariables
    ? { variables?: TVariables; requestOptions?: CallOptions; staleTime?: number }
    : { variables: TVariables; requestOptions?: CallOptions; staleTime?: number };

export type CourierComputedQueryOptions<TQueryResponse, TStreamData, TVariables> =
  WithVariables<TVariables> & {
    /** SSE endpoint method name (on the same group) that provides live updates */
    subscriptionMethod: string;
    /** Variables for the SSE subscription (defaults to query variables) */
    subscriptionVariables?: unknown;
    /** Merge each stream event into the cached query data */
    mapper: (current: TQueryResponse | undefined, event: SSEEvent<TStreamData>) => TQueryResponse;
    /** Disable both query and subscription (default: true) */
    enabled?: boolean;
    /** react-query staleTime */
    staleTime?: number;
    requestOptions?: CallOptions;
  };
