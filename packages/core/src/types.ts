import type { Endpoint } from "./define/types";
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
  TResponse = ExtractResponse<TEndpoint extends Endpoint<any, any> ? TEndpoint : unknown>,
>(
  ...arguments_: EndpointArguments<TEndpointKey, TEndpoint>
) => EndpointResult<TRaw, TResponse>;

type EndpointArguments<
  TEndpointKey,
  TEndpoint extends Endpoint<any, any>,
  TVariables = ExtractVariables<TEndpoint>,
> = TVariables extends undefined
  ? [endpoint: TEndpointKey]
  : [endpoint: TEndpointKey, variables: TVariables];

type ExtractResponse<TCandidate extends Endpoint<any, any>> =
  TCandidate extends Endpoint<infer TResponse, any> ? TResponse : unknown;

type ExtractVariables<TCandidate extends Endpoint<any, any>> =
  TCandidate extends Endpoint<any, infer TVariables> ? TVariables : unknown;

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

type FunctionKeys<TObj extends Record<string, any>> = NonNullable<
  {
    [TKey in keyof TObj]: TObj[TKey] extends (...args: never[]) => unknown
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
