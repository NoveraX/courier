import type {
  AnyEndpoint,
  InferKind,
  InferResponse,
  InferSend,
  InferVariables,
} from "../define/marker";
import type { AnyEndpointFn, DefinedApi, EndpointRecord, GroupRecord } from "../define/types";
import type {
  EndpointMethod,
  ResolveMethod,
  SSEMethod,
  StreamAfter,
  WithOptions,
  WSChannelMethod,
} from "./method-types";

export type { EndpointResult, WithOptions } from "./method-types";

/** Methods exposed on a group client (excludes 'options' from the group) */
type GroupMethods<TGroup, TRaw extends boolean, TStream extends boolean> = {
  [K in keyof TGroup as K extends "options" ? never : K]: TGroup[K] extends AnyEndpointFn
    ? ResolveMethod<TGroup[K], TRaw, TStream>
    : never;
};

/** Conditionally expose .raw only when not already in raw mode */
type RawAccessor<TClient> = { raw: TClient };

/** A group with typed methods, .raw accessor, and .with() */
export type GroupClient<
  TGroup,
  TRaw extends boolean = false,
  TStream extends boolean = false,
> = GroupMethods<TGroup, TRaw, TStream> &
  (TRaw extends true ? unknown : RawAccessor<GroupClient<TGroup, true, TStream>>) & {
    with<const TOptions extends WithOptions>(
      options: TOptions,
    ): GroupClient<TGroup, TRaw, StreamAfter<TOptions, TStream>>;
  };

/** Extract groups from a DefinedApi */
type ApiGroups<TApi extends DefinedApi<any>> = TApi["options"]["groups"];

/** Flat endpoint — callable function with .raw and .with() support */
type FlatEndpointMethod<
  TResponse,
  TVariables,
  TRaw extends boolean,
  TStream extends boolean,
> = EndpointMethod<TResponse, TVariables, TRaw, TStream> &
  (TRaw extends true
    ? unknown
    : RawAccessor<FlatEndpointMethod<TResponse, TVariables, true, TStream>>) & {
    with<const TOptions extends WithOptions>(
      options: TOptions,
    ): FlatEndpointMethod<TResponse, TVariables, TRaw, StreamAfter<TOptions, TStream>>;
  };

/**
 * Method type for a flat endpoint descriptor.
 *
 * Mirrors the grouped resolution, with the addition that an HTTP endpoint
 * reached at the root also carries `.raw` and `.with()`.
 */
type FlatDescriptorMethod<
  TEndpoint extends AnyEndpoint,
  TRaw extends boolean,
  TStream extends boolean,
> =
  InferKind<TEndpoint> extends "stream"
    ? SSEMethod<InferResponse<TEndpoint>, InferVariables<TEndpoint>>
    : InferKind<TEndpoint> extends "channel"
      ? WSChannelMethod<InferResponse<TEndpoint>, InferSend<TEndpoint>, InferVariables<TEndpoint>>
      : FlatEndpointMethod<InferResponse<TEndpoint>, InferVariables<TEndpoint>, TRaw, TStream>;

/** Flat endpoint methods at root level */
type FlatMethods<TEndpoints, TRaw extends boolean, TStream extends boolean> = {
  [K in keyof TEndpoints as K extends "options" ? never : K]: TEndpoints[K] extends AnyEndpointFn
    ? TEndpoints[K] extends AnyEndpoint
      ? FlatDescriptorMethod<TEndpoints[K], TRaw, TStream>
      : never
    : never;
};

/** Client for flat API (no groups) */
export type FlatClient<
  TEndpoints extends EndpointRecord,
  TRaw extends boolean = false,
  TStream extends boolean = false,
> = FlatMethods<TEndpoints, TRaw, TStream> &
  (TRaw extends true ? unknown : RawAccessor<FlatClient<TEndpoints, true, TStream>>) & {
    with<const TOptions extends WithOptions>(
      options: TOptions,
    ): FlatClient<TEndpoints, TRaw, StreamAfter<TOptions, TStream>>;
  };

/** Client for grouped API */
export type TypedClient<
  TApi extends DefinedApi<any>,
  TRaw extends boolean = false,
  TStream extends boolean = false,
> = {
  [K in keyof ApiGroups<TApi>]: GroupClient<ApiGroups<TApi>[K], TRaw, TStream>;
} & (TRaw extends true ? unknown : RawAccessor<TypedClient<TApi, true, TStream>>) & {
    with<const TOptions extends WithOptions>(
      options: TOptions,
    ): TypedClient<TApi, TRaw, StreamAfter<TOptions, TStream>>;
  };

/** Client for mixed API (groups + flat endpoints) */
export type MixedClient<
  TGroups extends GroupRecord,
  TEndpoints extends EndpointRecord,
  TRaw extends boolean = false,
  TStream extends boolean = false,
> = {
  [K in keyof TGroups]: GroupClient<TGroups[K], TRaw, TStream>;
} & FlatMethods<TEndpoints, TRaw, TStream> &
  (TRaw extends true ? unknown : RawAccessor<MixedClient<TGroups, TEndpoints, true, TStream>>) & {
    with<const TOptions extends WithOptions>(
      options: TOptions,
    ): MixedClient<TGroups, TEndpoints, TRaw, StreamAfter<TOptions, TStream>>;
  };

/**
 * A source's own endpoints, as the source declares them.
 *
 * Intersected with `EndpointRecord` to satisfy the client types, they gained
 * a string index signature, and the client a member of every name.
 */
type OwnEndpointsOf<TSource> =
  Omit<TSource, "options"> extends infer TEndpoints extends EndpointRecord ? TEndpoints : never;

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
    : MixedClient<TGroups, OwnEndpointsOf<TSource>>
  : FlatClient<OwnEndpointsOf<TSource>>;

/** Function that performs the actual request (implemented differently for direct/proxy modes) */
export type ExecuteBackend = (
  group: string,
  method: string,
  variables: unknown,
  options: Record<string, unknown>,
  raw: boolean,
) => unknown;
