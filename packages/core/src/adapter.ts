import { answerPreflight, withCorsHeaders } from "./adapter/cors";
import { discardBody } from "./adapter/discard-body";
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
import type { RequestPayloadInput } from "./utils/helpers";

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
  const allowedOrigins = config?.allowedOrigins;
  /* Every entry point answers a preflight and grants a listed origin its
     permission, because an adapter may mount any one of them on its own. */
  const withCors =
    (serve: (request: Request) => Promise<Response>) =>
    async (request: Request): Promise<Response> => {
      if (request.method === "OPTIONS") return answerOptions(request, allowedOrigins);
      return withCorsHeaders(request, await serve(request), allowedOrigins);
    };

  const execute = (
    request: Request,
    payload: RequestPayloadInput,
    proxyMethod: "GET" | "POST",
    proxyReceiveAt: number,
  ) =>
    executeRequest(servedSources(config?.sources), payload, {
      req: request,
      res: new Response(),
      proxyMethod,
      mode: "proxy",
      proxyReceiveAt,
    });

  const dt = studioHooks;
  const handleGet = withCors(createGetHandler(execute, dt, config));
  const handlePost = withCors(createPostHandler(execute, dt, config));

  const sseRegistry = createSSEConnectionRegistry();
  const handleSSE = withCors(createSSEHandler(config, sseRegistry));

  const handle = async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return answerOptions(request, allowedOrigins);
    if (isSSERequest(request)) return handleSSE(request);
    if (request.method === "GET") return handleGet(request);
    if (request.method === "POST") return handlePost(request);
    discardBody(request);
    return errorResponse(405, "Method not allowed");
  };

  return {
    handle,
    handleGet,
    handlePost,
    handleSSE,
    sseConnections: sseRegistry,
    shutdownSSE: (opts) => sseRegistry.shutdown(opts),
  };
}

/** A preflight is answered; any other OPTIONS request asks for nothing the proxy serves. */
function answerOptions(request: Request, allowedOrigins: string[] | undefined): Response {
  return answerPreflight(request, allowedOrigins) ?? errorResponse(405, "Method not allowed");
}

/** Detect SSE requests by Accept header or _transport query param */
function isSSERequest(request: Request): boolean {
  if (request.headers.get("Accept")?.includes("text/event-stream")) return true;
  const url = new URL(request.url);
  return url.searchParams.get("_transport") === "sse";
}
