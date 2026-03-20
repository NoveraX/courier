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

export type WithVariables<TVariables> = [TVariables] extends [undefined]
  ? { variables?: undefined }
  : {} extends TVariables
    ? { variables?: TVariables }
    : { variables: TVariables };

/** Resolve TVariables for react-query mutations: void when no args needed */
// biome-ignore lint/suspicious/noConfusingVoidType: void is required for react-query's mutate() to accept zero arguments
export type MutationVariables<TVariables> = [TVariables] extends [undefined]
  ? void
  : {} extends TVariables
    ? void | TVariables
    : TVariables;

export type GroupMethodKeys<TGroup> = Exclude<keyof TGroup, "options"> & string;

// ---------------------------------------------------------------------------
// Exported option types
// ---------------------------------------------------------------------------

export type NexusQueryOptions<TResponse, TVariables> = WithVariables<TVariables> &
  Omit<UseQueryOptions<TResponse, HTTPError, TResponse, QueryKey>, "queryKey" | "queryFn"> & {
    requestOptions?: CallOptions;
  };

export type NexusSuspenseQueryOptions<TResponse, TVariables> = WithVariables<TVariables> &
  Omit<
    UseSuspenseQueryOptions<TResponse, HTTPError, TResponse, QueryKey>,
    "queryKey" | "queryFn"
  > & {
    requestOptions?: CallOptions;
  };

export type NexusInfiniteQueryOptions<TResponse, TVariables, TPageParam> = {
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

export type NexusMutationOptions<TResponse, TVariables> = Omit<
  UseMutationOptions<TResponse, HTTPError, MutationVariables<TVariables>>,
  "mutationFn"
> & {
  requestOptions?: CallOptions;
  /** Query keys to automatically invalidate on mutation success. */
  invalidate?: QueryKey[];
};

export type NexusPrefetchOptions<TVariables> = [TVariables] extends [undefined]
  ? { variables?: undefined; requestOptions?: CallOptions; staleTime?: number }
  : {} extends TVariables
    ? { variables?: TVariables; requestOptions?: CallOptions; staleTime?: number }
    : { variables: TVariables; requestOptions?: CallOptions; staleTime?: number };

// ---------------------------------------------------------------------------
// QueryGroupClient & QueryCallerClient types
// ---------------------------------------------------------------------------

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
      : [options?: Record<string, unknown>]
  ) => TGroup[TMethod] extends Endpoint<infer TResponse, any>
    ? UseQueryResult<TResponse, HTTPError>
    : UseQueryResult<unknown, HTTPError>;

  useSuspenseQuery: <TMethod extends GroupMethodKeys<TGroup>>(
    method: TMethod,
    ...args: TGroup[TMethod] extends Endpoint<infer TResponse, infer TVariables>
      ? [TVariables] extends [undefined]
        ? [options?: NexusSuspenseQueryOptions<TResponse, TVariables>]
        : {} extends TVariables
          ? [options?: NexusSuspenseQueryOptions<TResponse, TVariables>]
          : [options: NexusSuspenseQueryOptions<TResponse, TVariables>]
      : [options?: Record<string, unknown>]
  ) => TGroup[TMethod] extends Endpoint<infer TResponse, any>
    ? UseSuspenseQueryResult<TResponse, HTTPError>
    : UseSuspenseQueryResult<unknown, HTTPError>;

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
      : [options?: Record<string, unknown>]
  ) => Promise<void>;
};

/** Top-level query client with group-based dot-notation access */
export type QueryCallerClient<TApi extends DefinedApi<any>> = {
  [TKey in keyof TApi["options"]["groups"]]: QueryGroupClient<TApi["options"]["groups"][TKey]>;
};
