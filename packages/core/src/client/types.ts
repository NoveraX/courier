import type {
  AnyEndpoint,
  InferKind,
  InferResponse,
  InferSend,
  InferVariables,
} from "../define/marker";
import type { AnyEndpointFn, DefinedApi, EndpointRecord, GroupRecord } from "../define/types";
import type { CallOptions, HttpResponse } from "../http-client/types";
import type { SSESubscription, WSChannel } from "../realtime/types";

/** Options for .with() — all CallOptions except rawData (controlled via .raw) */
export type WithOptions = Omit<CallOptions, "rawData">;

/** Return type based on Raw flag */
type EndpointReturn<TResponse, TRaw extends boolean> = Promise<
  TRaw extends true ? Partial<HttpResponse<TResponse>> : TResponse
>;

/** Typed method signature — adapts based on whether variables are required */
type EndpointMethod<TResponse, TVariables, TRaw extends boolean> = [TVariables] extends [
  undefined | void,
]
  ? () => EndpointReturn<TResponse, TRaw>
  : {} extends TVariables
    ? (variables?: TVariables) => EndpointReturn<TResponse, TRaw>
    : (variables: TVariables) => EndpointReturn<TResponse, TRaw>;

/** SSE subscription method — returns SSESubscription (not Promise) */
type SSEMethod<TResponse, TVariables> = [TVariables] extends [undefined | void]
  ? () => SSESubscription<TResponse>
  : {} extends TVariables
    ? (variables?: TVariables) => SSESubscription<TResponse>
    : (variables: TVariables) => SSESubscription<TResponse>;

/** WS channel method — returns WSChannel (not Promise) */
type WSChannelMethod<TResponse, TReceive, TVariables> = [TVariables] extends [undefined | void]
  ? () => WSChannel<TReceive, TResponse>
  : {} extends TVariables
    ? (variables?: TVariables) => WSChannel<TReceive, TResponse>
    : (variables: TVariables) => WSChannel<TReceive, TResponse>;

/**
 * Method type for an endpoint descriptor.
 *
 * Dispatches on the declared kind through indexed access, so adding a slot to
 * an endpoint never changes how its call signature is resolved.
 */
type DescriptorMethod<TEndpoint extends AnyEndpoint, TRaw extends boolean> =
  InferKind<TEndpoint> extends "stream"
    ? SSEMethod<InferResponse<TEndpoint>, InferVariables<TEndpoint>>
    : InferKind<TEndpoint> extends "channel"
      ? WSChannelMethod<InferResponse<TEndpoint>, InferSend<TEndpoint>, InferVariables<TEndpoint>>
      : EndpointMethod<InferResponse<TEndpoint>, InferVariables<TEndpoint>, TRaw>;

/** Resolve the method type an endpoint exposes on a group client. */
type ResolveMethod<TEndpoint, TRaw extends boolean> = TEndpoint extends AnyEndpoint
  ? DescriptorMethod<TEndpoint, TRaw>
  : never;

/** Methods exposed on a group client (excludes 'options' from the group) */
type GroupMethods<TGroup, TRaw extends boolean> = {
  [K in keyof TGroup as K extends "options" ? never : K]: TGroup[K] extends AnyEndpointFn
    ? ResolveMethod<TGroup[K], TRaw>
    : never;
};

/** Conditionally expose .raw only when not already in raw mode */
type RawAccessor<TClient> = { raw: TClient };

/** A group with typed methods, .raw accessor, and .with() */
export type GroupClient<TGroup, TRaw extends boolean = false> = GroupMethods<TGroup, TRaw> &
  (TRaw extends true ? unknown : RawAccessor<GroupClient<TGroup, true>>) & {
    with(options: WithOptions): GroupClient<TGroup, TRaw>;
  };

/** Extract groups from a DefinedApi */
type ApiGroups<TApi extends DefinedApi<any>> = TApi["options"]["groups"];

/** Flat endpoint — callable function with .raw and .with() support */
type FlatEndpointMethod<TResponse, TVariables, TRaw extends boolean> = EndpointMethod<
  TResponse,
  TVariables,
  TRaw
> &
  (TRaw extends true ? unknown : RawAccessor<FlatEndpointMethod<TResponse, TVariables, true>>) & {
    with(options: WithOptions): FlatEndpointMethod<TResponse, TVariables, TRaw>;
  };

/**
 * Method type for a flat endpoint descriptor.
 *
 * Mirrors the grouped resolution, with the addition that an HTTP endpoint
 * reached at the root also carries `.raw` and `.with()`.
 */
type FlatDescriptorMethod<TEndpoint extends AnyEndpoint, TRaw extends boolean> =
  InferKind<TEndpoint> extends "stream"
    ? SSEMethod<InferResponse<TEndpoint>, InferVariables<TEndpoint>>
    : InferKind<TEndpoint> extends "channel"
      ? WSChannelMethod<InferResponse<TEndpoint>, InferSend<TEndpoint>, InferVariables<TEndpoint>>
      : FlatEndpointMethod<InferResponse<TEndpoint>, InferVariables<TEndpoint>, TRaw>;

/** Resolve the method type an endpoint exposes at the root of a client. */
type ResolveFlatMethod<TEndpoint, TRaw extends boolean> = TEndpoint extends AnyEndpoint
  ? FlatDescriptorMethod<TEndpoint, TRaw>
  : never;

/** Flat endpoint methods at root level */
type FlatMethods<TEndpoints, TRaw extends boolean> = {
  [K in keyof TEndpoints as K extends "options" ? never : K]: TEndpoints[K] extends AnyEndpointFn
    ? ResolveFlatMethod<TEndpoints[K], TRaw>
    : never;
};

/** Client for flat API (no groups) */
export type FlatClient<
  TEndpoints extends EndpointRecord,
  TRaw extends boolean = false,
> = FlatMethods<TEndpoints, TRaw> &
  (TRaw extends true ? unknown : RawAccessor<FlatClient<TEndpoints, true>>) & {
    with(options: WithOptions): FlatClient<TEndpoints, TRaw>;
  };

/** Client for grouped API */
export type TypedClient<TApi extends DefinedApi<any>, TRaw extends boolean = false> = {
  [K in keyof ApiGroups<TApi>]: GroupClient<ApiGroups<TApi>[K], TRaw>;
} & (TRaw extends true ? unknown : RawAccessor<TypedClient<TApi, true>>) & {
    with(options: WithOptions): TypedClient<TApi, TRaw>;
  };

/** Client for mixed API (groups + flat endpoints) */
export type MixedClient<
  TGroups extends GroupRecord,
  TEndpoints extends EndpointRecord,
  TRaw extends boolean = false,
> = {
  [K in keyof TGroups]: GroupClient<TGroups[K], TRaw>;
} & FlatMethods<TEndpoints, TRaw> &
  (TRaw extends true ? unknown : RawAccessor<MixedClient<TGroups, TEndpoints, true>>) & {
    with(options: WithOptions): MixedClient<TGroups, TEndpoints, TRaw>;
  };

/**
 * Infer the correct client type from a source definition type.
 * Used by createProxyCaller where the source type is passed as a generic.
 *
 * - DefinedApi<G>       -> TypedClient<T>
 * - DefinedFlatApi<E>   -> FlatClient<E>
 * - DefinedMixedApi<G,E>-> MixedClient<G, E>
 */
export type InferClient<TSource> = TSource extends {
  options: { groups: infer TGroups extends GroupRecord };
}
  ? [keyof Omit<TSource, "options">] extends [never]
    ? TypedClient<TSource & DefinedApi<TGroups>>
    : MixedClient<TGroups, Omit<TSource, "options"> & EndpointRecord>
  : FlatClient<Omit<TSource, "options"> & EndpointRecord>;

/** Function that performs the actual request (implemented differently for direct/proxy modes) */
export type ExecuteBackend = (
  group: string,
  method: string,
  variables: unknown,
  options: Record<string, unknown>,
  raw: boolean,
) => unknown;
