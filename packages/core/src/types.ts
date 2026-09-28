import type { AnyEndpoint, InferResponse, InferVariables } from "./define/marker";
import type { CallOptions, HttpResponse } from "./http-client/types";

export type CallerFn<TSources extends Record<string, unknown>> = <
  TKey extends keyof TSources,
  TRaw extends boolean = false,
>(
  source: TKey,
  options?: CallOptions<TRaw>,
) => <
  TEndpointKey extends EndpointKey<TSources[TKey]>,
  TEndpoint extends ResolveEndpoint<TSources[TKey], TEndpointKey>,
  TResponse = ExtractResponse<TEndpoint>,
>(
  ...arguments_: EndpointArguments<TEndpointKey, TEndpoint>
) => EndpointResult<TRaw, TResponse>;

type EndpointArguments<TEndpointKey, TEndpoint, TVariables = ExtractVariables<TEndpoint>> =
  // biome-ignore lint/suspicious/noConfusingVoidType: `void` is what an endpoint without variables declares
  [TVariables] extends [undefined | void]
    ? [endpoint: TEndpointKey]
    : [endpoint: TEndpointKey, variables: TVariables];

type ExtractResponse<TCandidate> = TCandidate extends AnyEndpoint
  ? InferResponse<TCandidate>
  : unknown;

type ExtractVariables<TCandidate> = TCandidate extends AnyEndpoint
  ? InferVariables<TCandidate>
  : unknown;

type SplitEndpointKey<TKey> = TKey extends `${infer TGroup}:${infer TMethod}`
  ? { group: TGroup; method: TMethod }
  : { group: undefined; method: TKey };

/** A field of an object type, or `never` when it has none by that name. */
type FieldOf<TObject, TKey> = TKey extends keyof TObject ? TObject[TKey] : never;

/** A source's groups, from `options.groups`; `never` for a source without groups. */
type Groups<TSource> = TSource extends { readonly options: infer TOptions }
  ? FieldOf<TOptions, "groups">
  : never;

export type ResolveEndpoint<
  TSource,
  TEndpointKey extends EndpointKey<TSource>,
  TSplit extends { group: unknown; method: unknown } = SplitEndpointKey<TEndpointKey>,
> = TSplit["group"] extends string
  ? FieldOf<FieldOf<Groups<TSource>, TSplit["group"]>, TSplit["method"]>
  : FieldOf<TSource, TSplit["method"]>;

type GroupedEndpoints<TGroups> = {
  [TKey in keyof TGroups]: TKey extends string ? `${TKey}:${FunctionKeys<TGroups[TKey]>}` : never;
}[keyof TGroups];

export type EndpointKey<TSource> =
  | FunctionKeys<TSource>
  | ([Groups<TSource>] extends [never] ? never : GroupedEndpoints<Groups<TSource>>);

type FunctionKeys<TObj> = NonNullable<
  {
    [TKey in keyof TObj]: TObj[TKey] extends AnyEndpoint
      ? TKey extends string
        ? TKey
        : never
      : never;
  }[keyof TObj]
>;

type EndpointResult<TRaw extends boolean = false, TResponse = unknown> = Promise<
  TRaw extends true ? Partial<HttpResponse<TResponse>> : TResponse
>;

export type SuccessResponse<TData = unknown> = {
  success: true;
  data: TData;
};
