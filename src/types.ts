import type { Endpoint } from "./define/types";
import type { CallOptions, Context, HttpResponse } from "./instance/types";

export type RequestFn<T extends Record<string, any>, D extends boolean = false> = <
  K extends keyof T,
  RD extends boolean = false,
>(
  source: K,
  options?: CallOptions<RD>,
) => <
  Q extends EndpointKey<T[K]>,
  M extends ResolveEndpoint<T[K], Q>,
  R = ExtractResponse<M extends Endpoint<any, any> ? M : unknown>,
>(
  ...arguments_: EndpointArguments<Q, M, D>
) => EndpointResult<RD, R>;

type EndpointArguments<
  Q,
  M extends Endpoint<any, any>,
  D extends boolean = false,
  V = ExtractVariables<M>,
> = D extends false
  ? V extends undefined
    ? [endpoint: Q]
    : [endpoint: Q, variables: V]
  : V extends undefined
    ? [endpoint: Q, context?: Context]
    : [endpoint: Q, variables: V, context?: Context];

type ExtractResponse<C extends Endpoint<any, any>> = C extends Endpoint<infer T, any> ? T : unknown;

type ExtractVariables<C extends Endpoint<any, any>> =
  C extends Endpoint<any, infer T> ? T : unknown;

type SplitEndpointKey<T extends string> = T extends `${infer Group}:${infer Method}`
  ? { group: Group; method: Method }
  : { group: undefined; method: T };

export type ResolveEndpoint<
  T extends Record<string, any>,
  R extends EndpointKey<T>,
  S extends Record<string, any> = SplitEndpointKey<R>,
  G extends string = S["group"],
  M extends string = S["method"],
> = G extends string ? Groups<T>[G][M] : T[M];

type GroupedEndpoints<T extends Record<string, any>> = {
  [K in keyof T]: K extends string ? `${K}:${FunctionKeys<T[K]>}` : never;
}[keyof T];

export type EndpointKey<T extends Record<string, any>, K extends Record<string, any> = Groups<T>> =
  K extends Record<string, any> ? FunctionKeys<T> | GroupedEndpoints<K> : FunctionKeys<T>;

type FunctionKeys<T extends Record<string, any>> = NonNullable<
  {
    [K in keyof T]: T[K] extends (...args: never[]) => unknown
      ? K extends string
        ? K
        : never
      : never;
  }[keyof T]
>;

type Groups<T extends Record<string, any>> = NonNullable<T["options"]>["groups"];

type EndpointResult<T extends boolean = false, R = unknown> = Promise<
  T extends true ? Partial<HttpResponse<R>> : R
>;

export type SuccessResponse<D = unknown> = {
  success: true;
  data: D;
};
