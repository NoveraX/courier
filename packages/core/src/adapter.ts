import { discardBody } from "./adapter/discard-body";
import { gateEntry } from "./adapter/entry-gate";
import type { ExecuteFn } from "./adapter/execute-fn";
import { createGetHandler } from "./adapter/handle-get";
import { createPostHandler } from "./adapter/handle-post";
import { createSSEHandler } from "./adapter/handle-sse";
import type { HandlerConfig } from "./adapter/handler-config";
import { errorResponse } from "./adapter/parse";
import { servedSources } from "./adapter/served-sources";
import { createSSEConnectionRegistry } from "./adapter/sse-registry";
import type { SSEConnectionRegistry } from "./adapter/sse-types";
import { prepareSources } from "./sources";
import { studioHooks } from "./studio";
import { executeRequest } from "./utils/execute";

export { buildSSECorsHeaders } from "./adapter/format-sse";
export { type ClientConnection, handleWhileConnected } from "./adapter/handle-while-connected";
export { createWSHandler } from "./adapter/handle-ws";
export type { HandlerConfig } from "./adapter/handler-config";
export { requireSources } from "./adapter/require-sources";
export type {
  SSEBroadcastEvent,
  SSEBroadcastResult,
  SSECloseReason,
  SSEConnectionInfo,
  SSEConnectionRegistry,
  SSELifecycleConfig,
} from "./adapter/sse-types";
export type { ConnectionInfo, ConnectionRegistry } from "./adapter/ws-registry";
export { sendAuthRequired } from "./adapter/ws-token-refresh";
export type { CourierWSOptions, WSHandler, WSHandlerConfig } from "./adapter/ws-types";
export type { WebSocketLike } from "./realtime/adapters";

export type AdapterHandler = {
  /** Handle any HTTP method (auto-routes GET/POST/SSE, returns 405 for others) */
  handle: (request: Request) => Promise<Response>;
  /** Handle GET request (query endpoints only) */
  handleGet: (request: Request) => Promise<Response>;
  /** Handle POST request (mutations + data) */
  handlePost: (request: Request) => Promise<Response>;
  /** Handle SSE request (streaming endpoints) */
  handleSSE: (request: Request) => Promise<Response>;
  /** Active SSE connection registry for monitoring and lifecycle control */
  readonly sseConnections: SSEConnectionRegistry;
  /** Gracefully shut down all SSE connections (send shutdown event + drain) */
  shutdownSSE: (options?: { retryMs?: number; drainMs?: number }) => Promise<void>;
};

/**
 * Create a framework-agnostic HTTP adapter handler. Zero-arg callable —
 * unless `config.sources` names them, sources are read lazily from the core
 * global registry (populated by `attachRuntime()` at startup), so a single
 * `courierHandler()` expression in user code works regardless of which
 * framework owns the listen socket.
 *
 * @param config - Origins, limits, SSE lifecycle and, optionally, the sources
 * @returns The handler, its SSE registry and its shutdown
 * @throws ConfigurationError when `config.sources` is not a dictionary of sources
 *
 * @example
 * ```ts
 * const handler = createHandler({ allowedOrigins: ["https://app.example.com"] });
 * const response = await handler.handle(request);
 * ```
 */
export function createHandler(config?: HandlerConfig): AdapterHandler {
  if (config?.sources !== undefined) {
    prepareSources(config.sources, "createHandler", "createHandler({ sources: { api } })");
  }
  const execute: ExecuteFn = (request, payload, proxyMethod, proxyReceiveAt, requestId) =>
    executeRequest(servedSources(config?.sources), payload, {
      req: request,
      res: new Response(),
      proxyMethod,
      mode: "proxy",
      proxyReceiveAt,
      studioRequestId: requestId,
    });

  const dt = studioHooks;
  const get = createGetHandler(execute, dt, config);
  const post = createPostHandler(execute, dt, config);
  const sseRegistry = createSSEConnectionRegistry();
  const sse = createSSEHandler(config, sseRegistry);

  const route = async (request: Request): Promise<Response> => {
    if (isSSERequest(request)) return sse(request);
    if (request.method === "GET") return get(request);
    if (request.method === "POST") return post(request);
    discardBody(request);
    return errorResponse(405, "Method not allowed");
  };

  return {
    handle: gateEntry(route, config),
    handleGet: gateEntry(get, config),
    handlePost: gateEntry(post, config),
    handleSSE: gateEntry(sse, config),
    sseConnections: sseRegistry,
    shutdownSSE: (opts) => sseRegistry.shutdown(opts),
  };
}

/** Detect SSE requests by Accept header or _transport query param */
function isSSERequest(request: Request): boolean {
  if (request.headers.get("Accept")?.includes("text/event-stream")) return true;
  const url = new URL(request.url);
  return url.searchParams.get("_transport") === "sse";
}
