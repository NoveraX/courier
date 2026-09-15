import type { BaseOptions, GroupOptions, HttpMethods, HttpResponse } from "../http-client/types";
import type { ChannelHandlers, SSEHandler, WSPushHandler } from "../realtime/types";
import type { AnyEndpoint } from "./marker";

/** Typed HTTP endpoint function — the core building block */
export type Endpoint<TResponse, TVariables = undefined> = (
  methods: HttpMethods,
  variables: TVariables,
) => HttpResponse<TResponse> | Promise<HttpResponse<TResponse>>;

// ---------------------------------------------------------------------------
// Branded realtime endpoint types (phantom __transport — type-level only)
// ---------------------------------------------------------------------------

/** SSE endpoint — client receives `SSESubscription<R>` instead of `Promise<R>` */
export type SSEEndpoint<TResponse, TVariables = undefined> = SSEHandler<TResponse, TVariables> & {
  readonly __transport: "sse";
};

/** WS push-only endpoint — server→client streaming via async generator */
export type WSEndpoint<TResponse, TVariables = undefined> = WSPushHandler<TResponse, TVariables> & {
  readonly __transport: "ws";
};

/** WS bidirectional channel — client gets `WSChannel<TSend, TReceive>` */
export type WSChannelEndpoint<TResponse, TReceive = unknown, TVariables = undefined> = ((
  variables: TVariables,
) => ChannelHandlers<TReceive, TResponse, TVariables>) & {
  readonly __transport: "ws";
  readonly __receive: TReceive;
};

// ---------------------------------------------------------------------------

/** Any endpoint function (HTTP, SSE, or WS) — `any` required for contravariant type constraints */
export type AnyEndpointFn =
  | Endpoint<any, any>
  | SSEEndpoint<any, any>
  | WSEndpoint<any, any>
  | WSChannelEndpoint<any, any, any>
  | AnyEndpoint;

/** Record of endpoint functions keyed by method name */
export type EndpointRecord = Record<string, AnyEndpointFn>;

/** Configuration for defineGroup() */
export type DefineGroupConfig<TEndpoints extends EndpointRecord> = GroupOptions & {
  /** Map of named endpoint functions belonging to this group */
  endpoints: TEndpoints;
};

/** Result of defineGroup() — endpoint functions merged with group options */
export type DefinedGroup<TEndpoints extends EndpointRecord = EndpointRecord> = TEndpoints & {
  options: GroupOptions;
};

/** Constraint for groups parameter in defineApi() */
export type GroupRecord = Record<
  string,
  { options: GroupOptions; [key: string]: AnyEndpointFn | GroupOptions }
>;

/** Result of defineApi() with groups */
export type DefinedApi<TGroups extends GroupRecord = GroupRecord> = {
  options: BaseOptions & { groups: TGroups };
};

/** Result of defineApi() with flat endpoints (no groups) */
export type DefinedFlatApi<TEndpoints extends EndpointRecord = EndpointRecord> = {
  options: BaseOptions;
} & TEndpoints;

/** Result of defineApi() with groups + flat endpoints */
export type DefinedMixedApi<
  TGroups extends GroupRecord = GroupRecord,
  TEndpoints extends EndpointRecord = EndpointRecord,
> = {
  options: BaseOptions & { groups: TGroups };
} & TEndpoints;

/** Loose source type for executeRequest / createRequest */
export type AnySource = {
  options?: BaseOptions & { groups?: Record<string, { options?: GroupOptions }> };
};

/** Record of named sources */
export type Sources = Record<string, AnySource>;
