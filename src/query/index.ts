"use client";

export {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";

import {
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { type ClientRequestDefaults, createClientRequest } from "../create";
import type { Endpoint } from "../datasource";
import type { CallOptions } from "../instance/types";
import type { EndpointKey, ResolveEndpoint } from "../types";

type InferResponse<M> = M extends Endpoint<infer R, any> ? R : unknown;
type InferVariables<M> = M extends Endpoint<any, infer V> ? V : undefined;

type WithVariables<V> = [V] extends [undefined] ? { variables?: undefined } : { variables: V };

export type NexusQueryOptions<R, V> = WithVariables<V> &
  Omit<UseQueryOptions<R, Error, R, QueryKey>, "queryKey" | "queryFn"> & {
    requestOptions?: CallOptions;
  };

export type NexusMutationOptions<R, V> = Omit<
  UseMutationOptions<R, Error, [V] extends [undefined] ? void : V>,
  "mutationFn"
> & {
  requestOptions?: CallOptions;
};

export function createQueryRequest<T extends Record<string, any> = Record<string, any>>(
  defaults?: ClientRequestDefaults,
) {
  const client = createClientRequest<T>(defaults);

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
  ): UseQueryResult<R, Error> {
    const options = args[0];
    const { variables, requestOptions, ...queryOptions } = (options ?? {}) as any;

    return useQuery<R, Error>({
      queryKey: variables !== undefined ? [source, endpoint, variables] : [source, endpoint],
      queryFn: () => {
        const execute = client(source as any, requestOptions) as (...args: any[]) => Promise<R>;
        return variables !== undefined ? execute(endpoint, variables) : execute(endpoint);
      },
      ...queryOptions,
    });
  }

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
  ): UseMutationResult<R, Error, [V] extends [undefined] ? void : V> {
    const { requestOptions, ...mutationOptions } = (options ?? {}) as any;

    return useMutation<R, Error, [V] extends [undefined] ? void : V>({
      mutationFn: (variables: any) => {
        const execute = client(source as any, requestOptions) as (...args: any[]) => Promise<R>;
        return variables != null ? execute(endpoint, variables) : execute(endpoint);
      },
      ...mutationOptions,
    });
  }

  return {
    useQuery: useNexusQuery,
    useMutation: useNexusMutation,
    request: client,
  };
}
