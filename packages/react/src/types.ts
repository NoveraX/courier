/**
 * Public type entry point for Courier react-query integration.
 *
 * Defines `QueryGroupClient` (the dot-notation hook surface exposed per
 * API group) and `QueryCallerClient` (the top-level client keyed by group
 * name), and re-exports all option/result types from sibling modules.
 */

import type { HTTPError } from "@noverax/courier";
import type {
  AnyEndpoint,
  DefinedApi,
  InferResponse,
  InferSend,
  InferVariables,
} from "@noverax/courier/define";

/** What an endpoint answers, or never when the value is not one. */
type Res<T> = T extends AnyEndpoint ? InferResponse<T> : never;
/** What an endpoint is called with, or never when the value is not one. */
type Vars<T> = T extends AnyEndpoint ? InferVariables<T> : never;
/** What may be sent on an endpoint holding an open channel. */
type Sent<T> = T extends AnyEndpoint ? InferSend<T> : never;

import type {
  InfiniteData,
  QueryClient,
  UseInfiniteQueryResult,
  UseMutationResult,
  UseQueryResult,
  UseSuspenseQueryResult,
} from "@tanstack/react-query";

import type { MethodsOfKind, MutationVariables } from "./types-helpers";
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

export type {
  GroupMethodKeys,
  MethodsOfKind,
  MutationVariables,
  WithVariables,
} from "./types-helpers";
export type {
  CourierComputedQueryOptions,
  CourierInfiniteQueryOptions,
  CourierMutationOptions,
  CourierPrefetchOptions,
  CourierQueryOptions,
  CourierSuspenseQueryOptions,
} from "./types-options";
export type {
  ChannelError,
  ChannelResult,
  CourierChannelOptions,
  CourierSubscriptionOptions,
  SubscriptionResult,
} from "./types-realtime";

/** Hooks and utilities exposed per API group */
export type QueryGroupClient<TGroup> = {
  useQuery: <TMethod extends MethodsOfKind<TGroup, "query">>(
    method: TMethod,
    ...args: TGroup[TMethod] extends AnyEndpoint
      ? [Vars<TGroup[TMethod]>] extends [undefined | void]
        ? [options?: CourierQueryOptions<Res<TGroup[TMethod]>, Vars<TGroup[TMethod]>>]
        : {} extends Vars<TGroup[TMethod]>
          ? [options?: CourierQueryOptions<Res<TGroup[TMethod]>, Vars<TGroup[TMethod]>>]
          : [options: CourierQueryOptions<Res<TGroup[TMethod]>, Vars<TGroup[TMethod]>>]
      : never
  ) => TGroup[TMethod] extends AnyEndpoint
    ? UseQueryResult<Res<TGroup[TMethod]>, HTTPError>
    : never;

  useSuspenseQuery: <TMethod extends MethodsOfKind<TGroup, "query">>(
    method: TMethod,
    ...args: TGroup[TMethod] extends AnyEndpoint
      ? [Vars<TGroup[TMethod]>] extends [undefined | void]
        ? [options?: CourierSuspenseQueryOptions<Res<TGroup[TMethod]>, Vars<TGroup[TMethod]>>]
        : {} extends Vars<TGroup[TMethod]>
          ? [options?: CourierSuspenseQueryOptions<Res<TGroup[TMethod]>, Vars<TGroup[TMethod]>>]
          : [options: CourierSuspenseQueryOptions<Res<TGroup[TMethod]>, Vars<TGroup[TMethod]>>]
      : never
  ) => TGroup[TMethod] extends AnyEndpoint
    ? UseSuspenseQueryResult<Res<TGroup[TMethod]>, HTTPError>
    : never;

  useInfiniteQuery: <TMethod extends MethodsOfKind<TGroup, "query">, TPageParam>(
    method: TMethod,
    options: TGroup[TMethod] extends AnyEndpoint
      ? CourierInfiniteQueryOptions<Res<TGroup[TMethod]>, Vars<TGroup[TMethod]>, TPageParam>
      : never,
  ) => TGroup[TMethod] extends AnyEndpoint
    ? UseInfiniteQueryResult<InfiniteData<Res<TGroup[TMethod]>, TPageParam>, HTTPError>
    : never;

  useMutation: <TMethod extends MethodsOfKind<TGroup, "mutation">>(
    method: TMethod,
    options?: TGroup[TMethod] extends AnyEndpoint
      ? CourierMutationOptions<Res<TGroup[TMethod]>, Vars<TGroup[TMethod]>>
      : never,
  ) => TGroup[TMethod] extends AnyEndpoint
    ? UseMutationResult<Res<TGroup[TMethod]>, HTTPError, MutationVariables<Vars<TGroup[TMethod]>>>
    : never;

  prefetchQuery: <TMethod extends MethodsOfKind<TGroup, "query">>(
    queryClient: QueryClient,
    method: TMethod,
    ...args: TGroup[TMethod] extends AnyEndpoint
      ? [Vars<TGroup[TMethod]>] extends [undefined | void]
        ? [options?: CourierPrefetchOptions<Vars<TGroup[TMethod]>>]
        : {} extends Vars<TGroup[TMethod]>
          ? [options?: CourierPrefetchOptions<Vars<TGroup[TMethod]>>]
          : [options: CourierPrefetchOptions<Vars<TGroup[TMethod]>>]
      : never
  ) => Promise<void>;

  useSubscription: <TMethod extends MethodsOfKind<TGroup, "stream">>(
    method: TMethod,
    ...args: TGroup[TMethod] extends AnyEndpoint
      ? [Vars<TGroup[TMethod]>] extends [undefined | void]
        ? [options?: CourierSubscriptionOptions<Res<TGroup[TMethod]>, Vars<TGroup[TMethod]>>]
        : {} extends Vars<TGroup[TMethod]>
          ? [options?: CourierSubscriptionOptions<Res<TGroup[TMethod]>, Vars<TGroup[TMethod]>>]
          : [options: CourierSubscriptionOptions<Res<TGroup[TMethod]>, Vars<TGroup[TMethod]>>]
      : never
  ) => TGroup[TMethod] extends AnyEndpoint ? SubscriptionResult<Res<TGroup[TMethod]>> : never;

  useComputedQuery: <TMethod extends MethodsOfKind<TGroup, "query">>(
    method: TMethod,
    ...args: TGroup[TMethod] extends AnyEndpoint
      ? [Vars<TGroup[TMethod]>] extends [undefined | void]
        ? [
            options: CourierComputedQueryOptions<
              Res<TGroup[TMethod]>,
              unknown,
              Vars<TGroup[TMethod]>
            >,
          ]
        : {} extends Vars<TGroup[TMethod]>
          ? [
              options: CourierComputedQueryOptions<
                Res<TGroup[TMethod]>,
                unknown,
                Vars<TGroup[TMethod]>
              >,
            ]
          : [
              options: CourierComputedQueryOptions<
                Res<TGroup[TMethod]>,
                unknown,
                Vars<TGroup[TMethod]>
              >,
            ]
      : never
  ) => TGroup[TMethod] extends AnyEndpoint
    ? UseQueryResult<Res<TGroup[TMethod]>, HTTPError>
    : never;

  useChannel: <TMethod extends MethodsOfKind<TGroup, "channel">>(
    method: TMethod,
    ...args: TGroup[TMethod] extends AnyEndpoint
      ? [Vars<TGroup[TMethod]>] extends [undefined | void]
        ? [
            options?: CourierChannelOptions<
              TGroup[TMethod] extends AnyEndpoint ? Res<TGroup[TMethod]> : unknown,
              Vars<TGroup[TMethod]>
            >,
          ]
        : {} extends Vars<TGroup[TMethod]>
          ? [
              options?: CourierChannelOptions<
                TGroup[TMethod] extends AnyEndpoint ? Res<TGroup[TMethod]> : unknown,
                Vars<TGroup[TMethod]>
              >,
            ]
          : [
              options: CourierChannelOptions<
                TGroup[TMethod] extends AnyEndpoint ? Res<TGroup[TMethod]> : unknown,
                Vars<TGroup[TMethod]>
              >,
            ]
      : never
  ) => TGroup[TMethod] extends AnyEndpoint
    ? ChannelResult<Sent<TGroup[TMethod]>, Res<TGroup[TMethod]>>
    : never;
};

/** Top-level query client with group-based dot-notation access */
export type QueryCallerClient<TApi extends DefinedApi<any>> = {
  [TKey in keyof TApi["options"]["groups"]]: QueryGroupClient<TApi["options"]["groups"][TKey]>;
};
