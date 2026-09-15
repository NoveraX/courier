/**
 * Public type entry point for Courier react-query integration.
 *
 * Defines `QueryGroupClient` (the dot-notation hook surface exposed per
 * API group) and `QueryCallerClient` (the top-level client keyed by group
 * name), and re-exports all option/result types from sibling modules.
 */

import type { HTTPError } from "@noverax/courier";
import type { DefinedApi, Endpoint, SSEEndpoint, WSChannelEndpoint } from "@noverax/courier/define";
import type {
  InfiniteData,
  QueryClient,
  UseInfiniteQueryResult,
  UseMutationResult,
  UseQueryResult,
  UseSuspenseQueryResult,
} from "@tanstack/react-query";

import type { GroupMethodKeys, MutationVariables } from "./types-helpers";
import type {
  CourierComputedQueryOptions,
  CourierInfiniteQueryOptions,
  CourierMutationOptions,
  CourierPrefetchOptions,
  CourierQueryOptions,
  CourierSuspenseQueryOptions,
} from "./types-options";
import type {
  ChannelResult,
  CourierChannelOptions,
  CourierSubscriptionOptions,
  SubscriptionResult,
} from "./types-realtime";

export type { GroupMethodKeys, MutationVariables, WithVariables } from "./types-helpers";
export type {
  CourierComputedQueryOptions,
  CourierInfiniteQueryOptions,
  CourierMutationOptions,
  CourierPrefetchOptions,
  CourierQueryOptions,
  CourierSuspenseQueryOptions,
} from "./types-options";
export type {
  ChannelResult,
  CourierChannelOptions,
  CourierSubscriptionOptions,
  SubscriptionResult,
} from "./types-realtime";

/** Hooks and utilities exposed per API group */
export type QueryGroupClient<TGroup> = {
  useQuery: <TMethod extends GroupMethodKeys<TGroup>>(
    method: TMethod,
    ...args: TGroup[TMethod] extends Endpoint<infer TResponse, infer TVariables>
      ? [TVariables] extends [undefined]
        ? [options?: CourierQueryOptions<TResponse, TVariables>]
        : {} extends TVariables
          ? [options?: CourierQueryOptions<TResponse, TVariables>]
          : [options: CourierQueryOptions<TResponse, TVariables>]
      : never
  ) => TGroup[TMethod] extends Endpoint<infer TResponse, any>
    ? UseQueryResult<TResponse, HTTPError>
    : never;

  useSuspenseQuery: <TMethod extends GroupMethodKeys<TGroup>>(
    method: TMethod,
    ...args: TGroup[TMethod] extends Endpoint<infer TResponse, infer TVariables>
      ? [TVariables] extends [undefined]
        ? [options?: CourierSuspenseQueryOptions<TResponse, TVariables>]
        : {} extends TVariables
          ? [options?: CourierSuspenseQueryOptions<TResponse, TVariables>]
          : [options: CourierSuspenseQueryOptions<TResponse, TVariables>]
      : never
  ) => TGroup[TMethod] extends Endpoint<infer TResponse, any>
    ? UseSuspenseQueryResult<TResponse, HTTPError>
    : never;

  useInfiniteQuery: <TMethod extends GroupMethodKeys<TGroup>, TPageParam>(
    method: TMethod,
    options: TGroup[TMethod] extends Endpoint<infer TResponse, infer TVariables>
      ? CourierInfiniteQueryOptions<TResponse, TVariables, TPageParam>
      : never,
  ) => TGroup[TMethod] extends Endpoint<infer TResponse, any>
    ? UseInfiniteQueryResult<InfiniteData<TResponse, TPageParam>, HTTPError>
    : never;

  useMutation: <TMethod extends GroupMethodKeys<TGroup>>(
    method: TMethod,
    options?: TGroup[TMethod] extends Endpoint<infer TResponse, infer TVariables>
      ? CourierMutationOptions<TResponse, TVariables>
      : never,
  ) => TGroup[TMethod] extends Endpoint<infer TResponse, infer TVariables>
    ? UseMutationResult<TResponse, HTTPError, MutationVariables<TVariables>>
    : never;

  prefetchQuery: <TMethod extends GroupMethodKeys<TGroup>>(
    queryClient: QueryClient,
    method: TMethod,
    ...args: TGroup[TMethod] extends Endpoint<any, infer TVariables>
      ? [TVariables] extends [undefined]
        ? [options?: CourierPrefetchOptions<TVariables>]
        : {} extends TVariables
          ? [options?: CourierPrefetchOptions<TVariables>]
          : [options: CourierPrefetchOptions<TVariables>]
      : never
  ) => Promise<void>;

  useSubscription: <TMethod extends GroupMethodKeys<TGroup>>(
    method: TMethod,
    ...args: TGroup[TMethod] extends SSEEndpoint<infer TResponse, infer TVariables>
      ? [TVariables] extends [undefined]
        ? [options?: CourierSubscriptionOptions<TResponse, TVariables>]
        : {} extends TVariables
          ? [options?: CourierSubscriptionOptions<TResponse, TVariables>]
          : [options: CourierSubscriptionOptions<TResponse, TVariables>]
      : never
  ) => TGroup[TMethod] extends SSEEndpoint<infer TResponse, any>
    ? SubscriptionResult<TResponse>
    : never;

  useComputedQuery: <TMethod extends GroupMethodKeys<TGroup>>(
    method: TMethod,
    ...args: TGroup[TMethod] extends Endpoint<infer TResponse, infer TVariables>
      ? [TVariables] extends [undefined]
        ? [options: CourierComputedQueryOptions<TResponse, unknown, TVariables>]
        : {} extends TVariables
          ? [options: CourierComputedQueryOptions<TResponse, unknown, TVariables>]
          : [options: CourierComputedQueryOptions<TResponse, unknown, TVariables>]
      : never
  ) => TGroup[TMethod] extends Endpoint<infer TResponse, any>
    ? UseQueryResult<TResponse, HTTPError>
    : never;

  useChannel: <TMethod extends GroupMethodKeys<TGroup>>(
    method: TMethod,
    ...args: TGroup[TMethod] extends WSChannelEndpoint<
      infer _TResponse,
      infer _TReceive,
      infer TVariables
    >
      ? [TVariables] extends [undefined]
        ? [
            options?: CourierChannelOptions<
              TGroup[TMethod] extends WSChannelEndpoint<infer TRes, any, any> ? TRes : unknown,
              TVariables
            >,
          ]
        : {} extends TVariables
          ? [
              options?: CourierChannelOptions<
                TGroup[TMethod] extends WSChannelEndpoint<infer TRes, any, any> ? TRes : unknown,
                TVariables
              >,
            ]
          : [
              options: CourierChannelOptions<
                TGroup[TMethod] extends WSChannelEndpoint<infer TRes, any, any> ? TRes : unknown,
                TVariables
              >,
            ]
      : never
  ) => TGroup[TMethod] extends WSChannelEndpoint<infer TResponse, infer TReceive, any>
    ? ChannelResult<TReceive, TResponse>
    : never;
};

/** Top-level query client with group-based dot-notation access */
export type QueryCallerClient<TApi extends DefinedApi<any>> = {
  [TKey in keyof TApi["options"]["groups"]]: QueryGroupClient<TApi["options"]["groups"][TKey]>;
};
