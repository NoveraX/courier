import type { Context, MethodKyResponse, MethodsInstanceOptions } from "./instance/types";
import type { Method, RequestGroup } from "./RequestClass";

export type CommonRequest<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends Record<string, any>,
  D extends boolean = false,
> = <K extends keyof T, RD extends boolean = false>(
  source: K,
  options?: MethodsInstanceOptions<RD>,
) => <
  Q extends MethodGroup<T[K]>,
  M extends MethodSource<T[K], Q>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  R = MethodQueryResponse<M extends Method<any, any> ? M : unknown>,
>(
  ...arguments_: RequestArguments<Q, M, D>
) => MethodRequestResponse<RD, R>;

type RequestArguments<
  Q,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MethodRequestQueryVariables<M extends Method<any, any>> = MethodQueryVariables<M>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MethodQueryResponse<C extends Method<any, any>> =
  C extends Method<
    infer T,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >
    ? T
    : unknown;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MethodQueryVariables<C extends Method<any, any>> =
  C extends Method<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    infer T
  >
    ? T
    : unknown;

type SplitMethod<T extends string> = T extends `${infer Group}:${infer Method}`
  ? { group: Group; method: Method }
  : { group: undefined; method: T };

export type MethodSource<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends Record<string, any>,
  R extends MethodGroup<T>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  S extends Record<string, any> = SplitMethod<R>,
  G extends string = S["group"],
  M extends string = S["method"],
> = G extends string ? Groups<T>[G][M] : T[M];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TransformToGroup<T extends Record<string, any>> = {
  [K in keyof T]: K extends string ? `${K}:${ClassMethods<T[K]>}` : never;
}[keyof T];

export type MethodGroup<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  K extends Record<string, any> = Groups<T>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
> = K extends Record<string, any> ? ClassMethods<T> | TransformToGroup<K> : ClassMethods<T>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClassMethods<T extends Record<string, any>> = NonNullable<
  {
    // eslint-disable-next-line @typescript-eslint/ban-types
    [K in keyof T]: T[K] extends Function ? (K extends string ? K : never) : never;
  }[keyof T]
>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Groups<T extends Record<string, any>> = NonNullable<T["options"]>["groups"];

type MethodRequestResponse<T extends boolean = false, R = unknown> = Promise<
  T extends true ? Partial<MethodKyResponse<R>> : R
>;

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export type QueryOverrides = {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MethodsType<T extends Record<string, any>> = {
  [K in keyof T]: T[K];
};

export type AnyGroups = {
  [k: string]: RequestGroup;
};
