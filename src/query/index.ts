"use client";

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
import type { MethodsInstanceOptions } from "../instance/types";
import type { Method } from "../RequestClass";
import type { MethodGroup, MethodSource } from "../types";

type InferResponse<M> = M extends Method<infer R, any> ? R : unknown;
type InferVariables<M> = M extends Method<any, infer V> ? V : undefined;

type WithVariables<V> = [V] extends [undefined] ? { variables?: undefined } : { variables: V };

export type NexusQueryOptions<R, V> = WithVariables<V> &
  Omit<UseQueryOptions<R, Error, R, QueryKey>, "queryKey" | "queryFn"> & {
    requestOptions?: MethodsInstanceOptions;
  };

export type NexusMutationOptions<R, V> = Omit<
  UseMutationOptions<R, Error, [V] extends [undefined] ? void : V>,
  "mutationFn"
> & {
  requestOptions?: MethodsInstanceOptions;
};

export function createQueryRequest<T extends Record<string, any> = Record<string, any>>(
  defaults?: ClientRequestDefaults,
) {
  const client = createClientRequest<T>(defaults);

  function useNexusQuery<
    K extends keyof T & string,
    Q extends MethodGroup<T[K]>,
    M = MethodSource<T[K], Q>,
    R = InferResponse<M extends Method<any, any> ? M : never>,
    V = InferVariables<M extends Method<any, any> ? M : never>,
  >(
    source: K,
    query: Q,
    ...args: [V] extends [undefined]
      ? [options?: NexusQueryOptions<R, V>]
      : [options: NexusQueryOptions<R, V>]
  ): UseQueryResult<R, Error> {
    const options = args[0];
    const { variables, requestOptions, ...queryOptions } = (options ?? {}) as any;

    return useQuery<R, Error>({
      queryKey: variables !== undefined ? [source, query, variables] : [source, query],
      queryFn: () => {
        const execute = client(source as any, requestOptions) as (...args: any[]) => Promise<R>;
        return variables !== undefined ? execute(query, variables) : execute(query);
      },
      ...queryOptions,
    });
  }

  function useNexusMutation<
    K extends keyof T & string,
    Q extends MethodGroup<T[K]>,
    M = MethodSource<T[K], Q>,
    R = InferResponse<M extends Method<any, any> ? M : never>,
    V = InferVariables<M extends Method<any, any> ? M : never>,
  >(
    source: K,
    query: Q,
    options?: NexusMutationOptions<R, V>,
  ): UseMutationResult<R, Error, [V] extends [undefined] ? void : V> {
    const { requestOptions, ...mutationOptions } = (options ?? {}) as any;

    return useMutation<R, Error, [V] extends [undefined] ? void : V>({
      mutationFn: (variables: any) => {
        const execute = client(source as any, requestOptions) as (...args: any[]) => Promise<R>;
        return variables != null ? execute(query, variables) : execute(query);
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
