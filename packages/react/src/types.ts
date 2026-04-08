/**
 * Public type entry point for Nexus react-query integration.
 *
 * Defines `QueryGroupClient` (the dot-notation hook surface exposed per
 * API group) and `QueryCallerClient` (the top-level client keyed by group
 * name), and re-exports all option/result types from sibling modules.
 */

import type { HTTPError } from "@noverax/nexus";
import type { DefinedApi, Endpoint, SSEEndpoint, WSChannelEndpoint } from "@noverax/nexus/define";
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
  NexusComputedQueryOptions,
  NexusInfiniteQueryOptions,
  NexusMutationOptions,
  NexusPrefetchOptions,
  NexusQueryOptions,
  NexusSuspenseQueryOptions,
} from "./types-options";
import type {
  ChannelResult,
  NexusChannelOptions,
  NexusSubscriptionOptions,
  SubscriptionResult,
} from "./types-realtime";

export type { GroupMethodKeys, MutationVariables, WithVariables } from "./types-helpers";
export type {
  NexusComputedQueryOptions,
  NexusInfiniteQueryOptions,
  NexusMutationOptions,
  NexusPrefetchOptions,
  NexusQueryOptions,
  NexusSuspenseQueryOptions,
} from "./types-options";
export type {
  ChannelResult,
  NexusChannelOptions,
  NexusSubscriptionOptions,
  SubscriptionResult,
} from "./types-realtime";

/** Hooks and utilities exposed per API group */
export type QueryGroupClient<TGroup> = {
  useQuery: <TMethod extends GroupMethodKeys<TGroup>>(
    method: TMethod,
    ...args: TGroup[TMethod] extends Endpoint<infer TResponse, infer TVariables>
      ? [TVariables] extends [undefined]
        ? [options?: NexusQueryOptions<TResponse, TVariables>]
        : {} extends TVariables
          ? [options?: NexusQueryOptions<TResponse, TVariables>]
          : [options: NexusQueryOptions<TResponse, TVariables>]
      : never
  ) => TGroup[TMethod] extends Endpoint<infer TResponse, any>
    ? UseQueryResult<TResponse, HTTPError>
    : never;

  useSuspenseQuery: <TMethod extends GroupMethodKeys<TGroup>>(
    method: TMethod,
    ...args: TGroup[TMethod] extends Endpoint<infer TResponse, infer TVariables>
      ? [TVariables] extends [undefined]
        ? [options?: NexusSuspenseQueryOptions<TResponse, TVariables>]
        : {} extends TVariables
          ? [options?: NexusSuspenseQueryOptions<TResponse, TVariables>]
          : [options: NexusSuspenseQueryOptions<TResponse, TVariables>]
      : never
  ) => TGroup[TMethod] extends Endpoint<infer TResponse, any>
    ? UseSuspenseQueryResult<TResponse, HTTPError>
    : never;

  useInfiniteQuery: <TMethod extends GroupMethodKeys<TGroup>, TPageParam>(
    method: TMethod,
    options: TGroup[TMethod] extends Endpoint<infer TResponse, infer TVariables>
      ? NexusInfiniteQueryOptions<TResponse, TVariables, TPageParam>
      : never,
  ) => TGroup[TMethod] extends Endpoint<infer TResponse, any>
    ? UseInfiniteQueryResult<InfiniteData<TResponse, TPageParam>, HTTPError>
    : never;

  useMutation: <TMethod extends GroupMethodKeys<TGroup>>(
    method: TMethod,
    options?: TGroup[TMethod] extends Endpoint<infer TResponse, infer TVariables>
      ? NexusMutationOptions<TResponse, TVariables>
      : never,
  ) => TGroup[TMethod] extends Endpoint<infer TResponse, infer TVariables>
    ? UseMutationResult<TResponse, HTTPError, MutationVariables<TVariables>>
    : never;

  prefetchQuery: <TMethod extends GroupMethodKeys<TGroup>>(
    queryClient: QueryClient,
    method: TMethod,
    ...args: TGroup[TMethod] extends Endpoint<any, infer TVariables>
      ? [TVariables] extends [undefined]
        ? [options?: NexusPrefetchOptions<TVariables>]
        : {} extends TVariables
          ? [options?: NexusPrefetchOptions<TVariables>]
          : [options: NexusPrefetchOptions<TVariables>]
      : never
  ) => Promise<void>;

  useSubscription: <TMethod extends GroupMethodKeys<TGroup>>(
    method: TMethod,
    ...args: TGroup[TMethod] extends SSEEndpoint<infer TResponse, infer TVariables>
      ? [TVariables] extends [undefined]
        ? [options?: NexusSubscriptionOptions<TResponse, TVariables>]
        : {} extends TVariables
          ? [options?: NexusSubscriptionOptions<TResponse, TVariables>]
          : [options: NexusSubscriptionOptions<TResponse, TVariables>]
      : never
  ) => TGroup[TMethod] extends SSEEndpoint<infer TResponse, any>
    ? SubscriptionResult<TResponse>
    : never;

  useComputedQuery: <TMethod extends GroupMethodKeys<TGroup>>(
    method: TMethod,
    ...args: TGroup[TMethod] extends Endpoint<infer TResponse, infer TVariables>
      ? [TVariables] extends [undefined]
        ? [options: NexusComputedQueryOptions<TResponse, unknown, TVariables>]
        : {} extends TVariables
          ? [options: NexusComputedQueryOptions<TResponse, unknown, TVariables>]
          : [options: NexusComputedQueryOptions<TResponse, unknown, TVariables>]
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
            options?: NexusChannelOptions<
              TGroup[TMethod] extends WSChannelEndpoint<infer TRes, any, any> ? TRes : unknown,
              TVariables
            >,
          ]
        : {} extends TVariables
          ? [
              options?: NexusChannelOptions<
                TGroup[TMethod] extends WSChannelEndpoint<infer TRes, any, any> ? TRes : unknown,
                TVariables
              >,
            ]
          : [
              options: NexusChannelOptions<
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
