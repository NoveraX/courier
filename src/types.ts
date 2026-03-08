import type { Context, MethodKyResponse, MethodsInstanceOptions } from "./instance/types";
import type { Method, RequestGroup } from "./RequestClass";

export type CommonRequest<T extends Record<string, any>, D extends boolean = false> = <
  K extends keyof T,
  RD extends boolean = false,
>(
  source: K,
  options?: MethodsInstanceOptions<RD>,
) => <
  Q extends MethodGroup<T[K]>,
  M extends MethodSource<T[K], Q>,
  R = MethodQueryResponse<M extends Method<any, any> ? M : unknown>,
>(
  ...arguments_: RequestArguments<Q, M, D>
) => MethodRequestResponse<RD, R>;

type RequestArguments<
  Q,
  M extends Method<any, any>,
  D extends boolean = false,
  V = MethodRequestQueryVariables<M>,
> = D extends false
  ? V extends undefined
    ? [queryRequest: Q]
    : [queryRequest: Q, variables: V]
  : V extends undefined
    ? [queryRequest: Q, context?: Context]
    : [queryRequest: Q, variables: V, context?: Context];

type MethodRequestQueryVariables<M extends Method<any, any>> = MethodQueryVariables<M>;

type MethodQueryResponse<C extends Method<any, any>> = C extends Method<infer T, any> ? T : unknown;

type MethodQueryVariables<C extends Method<any, any>> =
  C extends Method<any, infer T> ? T : unknown;

type SplitMethod<T extends string> = T extends `${infer Group}:${infer Method}`
  ? { group: Group; method: Method }
  : { group: undefined; method: T };

export type MethodSource<
  T extends Record<string, any>,
  R extends MethodGroup<T>,
  S extends Record<string, any> = SplitMethod<R>,
  G extends string = S["group"],
  M extends string = S["method"],
> = G extends string ? Groups<T>[G][M] : T[M];

type TransformToGroup<T extends Record<string, any>> = {
  [K in keyof T]: K extends string ? `${K}:${ClassMethods<T[K]>}` : never;
}[keyof T];

export type MethodGroup<T extends Record<string, any>, K extends Record<string, any> = Groups<T>> =
  K extends Record<string, any> ? ClassMethods<T> | TransformToGroup<K> : ClassMethods<T>;

type ClassMethods<T extends Record<string, any>> = NonNullable<
  {
    [K in keyof T]: T[K] extends (...args: never[]) => unknown
      ? K extends string
        ? K
        : never
      : never;
  }[keyof T]
>;

type Groups<T extends Record<string, any>> = NonNullable<T["options"]>["groups"];

type MethodRequestResponse<T extends boolean = false, R = unknown> = Promise<
  T extends true ? Partial<MethodKyResponse<R>> : R
>;

export type AnyGroups = {
  [k: string]: RequestGroup;
};

export type SuccessResponse<D = unknown> = {
  success: true;
  data: D;
};
