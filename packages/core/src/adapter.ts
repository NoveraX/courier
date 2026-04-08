import { createGetHandler } from "./adapter/handle-get";
import { createPostHandler } from "./adapter/handle-post";
import { createSSEHandler } from "./adapter/handle-sse";
import type { HandlerConfig } from "./adapter/handler-config";
import { errorResponse } from "./adapter/parse";
import { createSSEConnectionRegistry } from "./adapter/sse-registry";
import type { SSEConnectionRegistry } from "./adapter/sse-types";
import type { Sources } from "./define/types";
import { studioHooks } from "./studio";
import { executeRequest } from "./utils/execute";
import type { RequestPayloadInput } from "./utils/helpers";

export { buildSSECorsHeaders } from "./adapter/format-sse";
export { createWSHandler } from "./adapter/handle-ws";
export type { HandlerConfig } from "./adapter/handler-config";
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
export type { NexusWSOptions, WSHandler, WSHandlerConfig } from "./adapter/ws-types";
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

export function createHandler(sources: Sources, config?: HandlerConfig): AdapterHandler {
  const execute = (
    request: Request,
    payload: RequestPayloadInput,
    proxyMethod: "GET" | "POST",
    proxyReceiveAt: number,
  ) =>
    executeRequest(sources, payload, {
      req: request,
      res: new Response(),
      proxyMethod,
      mode: "proxy",
      proxyReceiveAt,
    });

  const dt = studioHooks;
  const handleGet = createGetHandler(execute, dt);
  const handlePost = createPostHandler(execute, dt);

  const sseRegistry = createSSEConnectionRegistry();
  const handleSSE = createSSEHandler(sources, config, sseRegistry);

  const handle = async (request: Request): Promise<Response> => {
    if (isSSERequest(request)) return handleSSE(request);
    if (request.method === "GET") return handleGet(request);
    if (request.method === "POST") return handlePost(request);
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

/** Detect SSE requests by Accept header or _transport query param */
function isSSERequest(request: Request): boolean {
  if (request.headers.get("Accept")?.includes("text/event-stream")) return true;
  const url = new URL(request.url);
  return url.searchParams.get("_transport") === "sse";
}
