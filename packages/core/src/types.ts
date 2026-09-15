import type { AnyEndpoint, InferResponse, InferVariables } from "./define/marker";
import type { CallOptions, HttpResponse } from "./http-client/types";

export type CallerFn<TSources extends Record<string, any>> = <
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

type EndpointArguments<TEndpointKey, TEndpoint, TVariables = ExtractVariables<TEndpoint>> = [
  TVariables,
] extends [undefined | void]
  ? [endpoint: TEndpointKey]
  : [endpoint: TEndpointKey, variables: TVariables];

type ExtractResponse<TCandidate> = TCandidate extends AnyEndpoint
  ? InferResponse<TCandidate>
  : unknown;

type ExtractVariables<TCandidate> = TCandidate extends AnyEndpoint
  ? InferVariables<TCandidate>
  : unknown;

type SplitEndpointKey<TKey extends string> = TKey extends `${infer TGroup}:${infer TMethod}`
  ? { group: TGroup; method: TMethod }
  : { group: undefined; method: TKey };

export type ResolveEndpoint<
  TSource extends Record<string, any>,
  TEndpointKey extends EndpointKey<TSource>,
  TSplit extends Record<string, any> = SplitEndpointKey<TEndpointKey>,
  TGroup extends string = TSplit["group"],
  TMethod extends string = TSplit["method"],
> = TGroup extends string ? Groups<TSource>[TGroup][TMethod] : TSource[TMethod];

type GroupedEndpoints<TGroups extends Record<string, any>> = {
  [TKey in keyof TGroups]: TKey extends string ? `${TKey}:${FunctionKeys<TGroups[TKey]>}` : never;
}[keyof TGroups];

export type EndpointKey<
  TSource extends Record<string, any>,
  TGroupMap extends Record<string, any> = Groups<TSource>,
> =
  TGroupMap extends Record<string, any>
    ? FunctionKeys<TSource> | GroupedEndpoints<TGroupMap>
    : FunctionKeys<TSource>;

/** Names of the endpoints a source or group holds, ignoring its options. */
type FunctionKeys<TObj extends Record<string, any>> = NonNullable<
  {
    [TKey in keyof TObj]: TObj[TKey] extends AnyEndpoint
      ? TKey extends string
        ? TKey
        : never
      : never;
  }[keyof TObj]
>;

type Groups<TSource extends Record<string, any>> = NonNullable<TSource["options"]>["groups"];

type EndpointResult<TRaw extends boolean = false, TResponse = unknown> = Promise<
  TRaw extends true ? Partial<HttpResponse<TResponse>> : TResponse
>;

export type SuccessResponse<TData = unknown> = {
  success: true;
  data: TData;
};
