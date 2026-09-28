import { createLogger } from "../logger";
import type { SSEContext, SSEHandler } from "../realtime/types";
import { generateRequestId, registerPlaygroundAbort, studioHooks } from "../studio";
import { runTransportMiddleware } from "../utils/transport-middleware";
import { SSE_HEADERS } from "./format-sse";
import type { HandlerConfig } from "./handler-config";
import { isOriginAllowed } from "./origin-policy";
import { errorResponse } from "./parse";
import { servedSources } from "./served-sources";
import type { InternalSSERegistry } from "./sse-registry";
import { resolveSSEEndpoint, resolveSSEVariables } from "./sse-resolve";
import { createSSEStream } from "./sse-stream";
import { createLifetimeSignal } from "./sse-utils";

const log = createLogger("SSE");

function headersToRecord(h: Headers): Record<string, string> {
  const rec: Record<string, string> = {};
  h.forEach((v, k) => {
    rec[k] = v;
  });
  return rec;
}

function unavailable(message: string, retrySec: string): Response {
  return Response.json(
    { success: false, message },
    { status: 503, headers: { "Retry-After": retrySec } },
  );
}

/**
 * Create an SSE request handler for proxy mode.
 *
 * Routing: `GET /api/sse?_s=source&_g=group&_m=method&_v={"var1":"val1"}`
 * Client sends `Accept: text/event-stream` or uses `_transport=sse` query param.
 *
 * Includes: origin validation, middleware execution (with timeout), lifecycle hooks,
 * TTL-based stream lifetime, graceful shutdown support, variable schema validation.
 *
 * Unless the config names its own `sources`, they are read lazily from the
 * core global registry at request time, so a single `courierHandler()`
 * expression in user code works regardless of which framework owns the
 * listen socket.
 *
 * @param config - Optional handler config (origins, headers, TTL, lifecycle hooks)
 * @param registry - SSE connection registry for tracking/limiting active streams
 * @returns Async request handler `(request: Request) => Promise<Response>`
 */
export function createSSEHandler(
  config: HandlerConfig | undefined,
  registry: InternalSSERegistry,
): (request: Request) => Promise<Response> {
  const responseHeaders = { ...SSE_HEADERS, ...config?.sseHeaders };

  return async (request: Request): Promise<Response> => {
    if (!isOriginAllowed(request, config?.allowedOrigins)) {
      return errorResponse(403, "Origin not allowed");
    }
    if (registry.isShuttingDown) return unavailable("Service shutting down", "3");
    if (config?.maxSSEConnections && registry.count >= config.maxSSEConnections) {
      return unavailable("Too many SSE connections", "5");
    }

    const url = new URL(request.url);
    const source = url.searchParams.get("_s");
    const group = url.searchParams.get("_g") || undefined;
    const method = url.searchParams.get("_m");

    if (!source || !method) return errorResponse(400, "Missing required params: _s, _m");

    const sources = servedSources(config?.sources);
    const resolved = resolveSSEEndpoint(sources, source, group, method);
    if (resolved instanceof Response) return resolved;

    const variables = await resolveSSEVariables(url.searchParams, resolved.schema);
    if (variables instanceof Response) return variables;

    const connectionId = crypto.randomUUID();
    // Studio Playground proxy mode forwards its own pre-allocated requestId
    // via the `x-courier-playground-rid` header so the events emitted by this
    // handler correlate back to the playground tab that initiated the
    // Subscribe. Without this, the playground tab would silently receive
    // nothing — events would still flow through `studioHooks` but under a
    // server-generated id the UI cannot match.
    const playgroundRid = request.headers.get("x-courier-playground-rid");
    const requestId = playgroundRid ?? (studioHooks.onStreamOpen ? generateRequestId() : "");
    const dt = studioHooks;

    let headers: Headers;
    try {
      headers = await runTransportMiddleware({
        transport: "sse",
        sources,
        source,
        group,
        method,
        variables,
        request,
        requestId,
      });
    } catch (err) {
      log.warn(`Middleware refused the SSE stream for [${source}][${method}]`, err);
      return errorResponse(500, "Middleware error");
    }

    let meta: Record<string, unknown> = {};
    if (config?.onSSEConnect) {
      try {
        meta = await config.onSSEConnect({ connectionId, request, source, group, method });
      } catch (err) {
        /* What was thrown may carry a secret: it goes to the log only. */
        log.warn(`onSSEConnect rejected the SSE stream for [${source}][${method}]`, err);
        return errorResponse(403, "Connection rejected");
      }
    }

    dt.onStreamOpen?.({
      requestId,
      source,
      group,
      method,
      transport: "sse",
      mode: "proxy",
      timestamp: Date.now(),
      requestHeaders: headersToRecord(request.headers),
      /* What it answers with; its middleware's headers stay in the handler's context. */
      responseHeaders,
    });

    const { signal, ttlSignal } = createLifetimeSignal(
      request.signal,
      registry.shutdownSignal,
      config?.sseMaxLifetimeMs,
    );
    const sseCtx: SSEContext = {
      variables: variables ?? {},
      signal,
      lastEventId: request.headers.get("Last-Event-ID") ?? undefined,
      headers,
    };

    const sseHandler = resolved.endpoint as unknown as SSEHandler<unknown, unknown>;
    const stream = createSSEStream(sseHandler, sseCtx, {
      connectionId,
      requestId,
      source,
      group,
      method,
      meta,
      registry,
      dt,
      t0: performance.now(),
      ttlSignal,
      responseSchema: resolved.schema?.response,
      onDisconnect: config?.onSSEDisconnect,
      onError: config?.onSSEError,
      // When the request carries a Studio Playground rid, also register
      // an in-process abort handle so the playground executor can force-
      // close us deterministically — Node loopback fetch abort does NOT
      // synchronously propagate to `request.signal`, so without this the
      // user clicks Unsubscribe and events keep flowing.
      playgroundRid: playgroundRid ?? undefined,
      registerPlaygroundAbort,
    });

    return new Response(stream, { headers: responseHeaders });
  };
}
