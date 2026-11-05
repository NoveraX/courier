import { createRefusalLog } from "../logger/refusal-log";
import { prepareSources } from "../sources";
import { studioHooks } from "../studio";
import { executeRequest } from "../utils/execute";
import { assertBodyOptions } from "./assert-body-options";
import type { ConnectResult } from "./connection-meta";
import { discardBody } from "./discard-body";
import { gateEntry } from "./entry-gate";
import type { ExecuteFn } from "./execute-fn";
import { createGetHandler } from "./handle-get";
import { createPostHandler } from "./handle-post";
import { createSSEHandler } from "./handle-sse";
import type { HandlerConfig } from "./handler-config";
import { errorResponse } from "./parse";
import { assertRateLimit } from "./rate-limit/assert-rate-limit";
import { limitEntry } from "./rate-limit/limit-entry";
import { createProxyLimiter } from "./rate-limit/proxy-limiter";
import { assertListedSettings } from "./runtime-policy";
import { servedSources } from "./served-sources";
import { createSSEConnectionRegistry } from "./sse-registry";
import { replicateSSE } from "./sse-replication";
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
 * @param config - Hosts, origins, limits, SSE lifecycle and, optionally, the sources
 * @returns The handler, its SSE registry and its shutdown
 * @throws ConfigurationError when `config.sources` is not a dictionary of
 *   sources, `allowedHosts` or `allowedOrigins` is a list holding an entry
 *   no request can match — one given as a function is read with the first
 *   request — or an option for request bodies could not work as written
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
  assertListedSettings(config ?? {}, "createHandler");
  assertRateLimit(config?.rateLimit, "createHandler");
  assertBodyOptions(config, "createHandler");
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
  const get = createGetHandler(execute, dt);
  const post = createPostHandler(execute, dt, config);
  const sseRegistry = createSSEConnectionRegistry();
  const sse = createSSEHandler(config, sseRegistry);
  /* With a pub/sub adapter, the streams a selector names are ended on every replica. */
  const replication = replicateSSE(config, sseRegistry, createRefusalLog("SSE"));

  const route = async (request: Request): Promise<Response> => {
    if (isSSERequest(request)) return sse(request);
    if (request.method === "GET") return get(request);
    if (request.method === "POST") return post(request);
    discardBody(request);
    return errorResponse(405, "Method not allowed");
  };

  /* One limiter for every entry point, so a caller has one budget however an adapter mounts them. */
  const limiter = createProxyLimiter(config);
  /* One log of refusals for them too: a page refused on each is one line an interval. */
  const refusals = createRefusalLog("Proxy");
  const entry = (serve: (request: Request) => Promise<Response>) =>
    gateEntry(limitEntry(serve, limiter, dt), config, dt, refusals);

  return {
    handle: entry(route),
    handleGet: entry(get),
    handlePost: entry(post),
    handleSSE: entry(sse),
    sseConnections: replication?.connections ?? sseRegistry,
    async shutdownSSE(opts) {
      replication?.destroy();
      await sseRegistry.shutdown(opts);
    },
  };
}

/** Detect SSE requests by Accept header or _transport query param */
function isSSERequest(request: Request): boolean {
  if (request.headers.get("Accept")?.includes("text/event-stream")) return true;
  const url = new URL(request.url);
  return url.searchParams.get("_transport") === "sse";
}
