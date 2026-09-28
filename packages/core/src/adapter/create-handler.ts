import { prepareSources } from "../sources";
import { studioHooks } from "../studio";
import { executeRequest } from "../utils/execute";
import type { ConnectResult } from "./connection-meta";
import { discardBody } from "./discard-body";
import { gateEntry } from "./entry-gate";
import type { ExecuteFn } from "./execute-fn";
import { createGetHandler } from "./handle-get";
import { createPostHandler } from "./handle-post";
import { createSSEHandler } from "./handle-sse";
import type { HandlerConfig } from "./handler-config";
import { errorResponse } from "./parse";
import { servedSources } from "./served-sources";
import { createSSEConnectionRegistry } from "./sse-registry";
import type { SSEConnectionRegistry } from "./sse-types";

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
export function createHandler<TConnect extends ConnectResult = ConnectResult>(
  config?: HandlerConfig<TConnect>,
): AdapterHandler;
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
