import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { ChannelHandlers, SSEHandler, WSPushHandler } from "../realtime/types";
import type { CacheConfig, InferOutput, SchemaMetadata, Transport } from "../validation";
import { ENDPOINT_SCHEMA } from "../validation";
import type { Endpoint, SSEEndpoint, WSChannelEndpoint, WSEndpoint } from "./types";

/** Options for endpoint type, cache hints, and transport */
type EndpointOptions = {
  /** "query" enables GET proxy requests; "mutation" requires POST (default) */
  type?: "query" | "mutation";
  /** Cache hints for proxy GET responses */
  cache?: CacheConfig;
  /** Transport mode — "http" (default), "sse" for streaming, "ws" for WebSocket */
  transport?: Transport;
};

/**
 * Type-safe endpoint definition with optional Standard Schema validation.
 * Uses double-call pattern for partial generic inference.
 *
 * @example
 * // HTTP endpoint (explicit types):
 * endpoint<User[]>()((http) => http.get())
 *
 * // HTTP with schema (types inferred):
 * endpoint({ response: z.array(UserSchema) })((http) => http.get())
 *
 * // SSE streaming endpoint:
 * endpoint<Notification, { userId: string }>({ transport: "sse" })(async function* (ctx) { ... })
 *
 * // WS push-only endpoint:
 * endpoint<PriceUpdate, { symbol: string }>({ transport: "ws" })(async function* (ctx) { ... })
 *
 * // WS bidirectional channel:
 * endpoint<ChatMsg, { room: string }>({ transport: "ws", receive: msgSchema })((vars) => ({ onMessage, onJoin }))
 */

// --- SSE with variables schema overload ---
export function endpoint<TResponse, VS extends StandardSchemaV1>(
  config: { transport: "sse"; variables: VS } & Omit<EndpointOptions, "transport">,
): (fn: SSEHandler<TResponse, InferOutput<VS>>) => SSEEndpoint<TResponse, InferOutput<VS>>;

// --- SSE overload (no schema) ---
export function endpoint<TResponse, TVariables = undefined>(
  config: { transport: "sse" } & Omit<EndpointOptions, "transport">,
): (fn: SSEHandler<TResponse, TVariables>) => SSEEndpoint<TResponse, TVariables>;

// --- WS bidirectional channel overload (with receive schema — must be before push-only) ---
export function endpoint<
  TResponse,
  TVariables = undefined,
  RS extends StandardSchemaV1 = StandardSchemaV1,
>(
  config: { transport: "ws"; receive: RS } & Omit<EndpointOptions, "transport">,
): (
  fn: (variables: TVariables) => ChannelHandlers<InferOutput<RS>, TResponse, TVariables>,
) => WSChannelEndpoint<TResponse, InferOutput<RS>, TVariables>;

// --- WS push-only overload (no receive schema) ---
export function endpoint<TResponse, TVariables = undefined>(
  config: { transport: "ws" } & Omit<EndpointOptions, "transport">,
): (fn: WSPushHandler<TResponse, TVariables>) => WSEndpoint<TResponse, TVariables>;

// --- HTTP overloads (existing, unchanged) ---
export function endpoint<RS extends StandardSchemaV1, VS extends StandardSchemaV1>(
  config: { response: RS; variables: VS } & EndpointOptions,
): (fn: Endpoint<InferOutput<RS>, InferOutput<VS>>) => Endpoint<InferOutput<RS>, InferOutput<VS>>;

export function endpoint<RS extends StandardSchemaV1>(
  config: { response: RS } & EndpointOptions,
): (fn: Endpoint<InferOutput<RS>>) => Endpoint<InferOutput<RS>>;

export function endpoint<VS extends StandardSchemaV1>(
  config: { variables: VS } & EndpointOptions,
): (fn: Endpoint<unknown, InferOutput<VS>>) => Endpoint<unknown, InferOutput<VS>>;

export function endpoint<TResponse, TVariables = undefined>(): (
  fn: Endpoint<TResponse, TVariables>,
) => Endpoint<TResponse, TVariables>;

export function endpoint<TResponse, TVariables = undefined>(
  config: { response?: StandardSchemaV1; variables?: StandardSchemaV1 } & EndpointOptions,
): (fn: Endpoint<TResponse, TVariables>) => Endpoint<TResponse, TVariables>;

// --- Implementation — attaches metadata via Symbol, handler type varies by transport ---
export function endpoint(config?: SchemaMetadata & EndpointOptions) {
  return (fn: (...args: any[]) => any) => {
    if (config) {
      (fn as unknown as Record<symbol, unknown>)[ENDPOINT_SCHEMA] = config;
    }
    return fn;
  };
}
