import type { CourierWSOptions, HandlerConfig } from "@noverax/courier";
import {
  createHandler,
  createWSHandler,
  getAppOrigin,
  requireSources,
  setAppOrigin,
} from "@noverax/courier";
import { announceHosting } from "@noverax/courier/announce";
import type { Context } from "hono";
import type { HonoWSContext } from "./ws-adapter";
import { createSocketAdapter } from "./ws-adapter";

/**
 * Module-level first-request flag for `listenOrigin` auto-discovery.
 * Hono handlers stamp `appOrigin` from the first request URL's origin
 * when no config/env value is present. Config-supplied or env-var
 * values take precedence and are never overwritten.
 */
let firstRequestHandled = false;

function tryDiscoverAppOrigin(request: Request): void {
  if (firstRequestHandled) return;
  firstRequestHandled = true;
  if (getAppOrigin()) return;
  try {
    const url = new URL(request.url);
    if (url.origin && url.origin !== "null") setAppOrigin(url.origin);
  } catch {
    // Malformed URL in request — leave appOrigin unset.
  }
}

/**
 * Create a Hono handler for the courier proxy.
 *
 * Sources are read from the core global registry populated by
 * `attachRuntime()` — call `await attachRuntime()` in your server
 * instrumentation before mounting routes.
 *
 * @example
 * ```ts
 * import { Hono } from "hono";
 * import { attachRuntime } from "@noverax/courier-studio-core/runtime";
 * import { courierHandler } from "@noverax/courier-hono";
 *
 * const app = new Hono();
 * await attachRuntime();
 * app.all("/api/request", courierHandler());
 * ```
 */
export function courierHandler(config?: HandlerConfig) {
  const { handle } = createHandler(config);
  announceHosting({
    transports: ["http"],
    sources: Object.values(requireSources()),
    framework: "hono",
  });
  return (c: Context) => {
    tryDiscoverAppOrigin(c.req.raw);
    return handle(c.req.raw);
  };
}

/**
 * Create a Hono handler for SSE streaming endpoints.
 *
 * @example
 * ```ts
 * app.get("/api/sse", courierSSEHandler());
 * ```
 */
export function courierSSEHandler(config?: HandlerConfig) {
  const { handleSSE } = createHandler(config);
  announceHosting({
    transports: ["sse"],
    sources: Object.values(requireSources()),
    framework: "hono",
  });
  return (c: Context) => {
    tryDiscoverAppOrigin(c.req.raw);
    return handleSSE(c.req.raw);
  };
}

/** Hono WS event handlers — structurally compatible with upgradeWebSocket() */
export type HonoWSEvents = {
  onOpen?(event: unknown, ws: HonoWSContext): void;
  onMessage?(event: { data: string | ArrayBuffer }, ws: HonoWSContext): void;
  onClose?(event: { code: number }, ws: HonoWSContext): void;
  onError?(event: unknown, ws: HonoWSContext): void;
};

/**
 * Create Hono WebSocket event handlers for Courier realtime.
 * Use with your runtime's upgradeWebSocket helper.
 *
 * @param options - WS handler options (heartbeat, allowedOrigins, etc.)
 * @returns Factory that produces WSEvents per connection
 *
 * @example Node.js
 * ```ts
 * import { serve, upgradeWebSocket } from "@hono/node-server";
 * import { WebSocketServer } from "ws";
 *
 * const wss = new WebSocketServer({ noServer: true });
 * const ws = courierWSHandler();
 * app.get("/ws", upgradeWebSocket((c) => ws(c)));
 *
 * serve({ fetch: app.fetch, port: 3001, websocket: { server: wss } });
 * ```
 */
export function courierWSHandler(options?: CourierWSOptions): (c: Context) => HonoWSEvents {
  const wsHandler = createWSHandler(options);
  announceHosting({
    transports: ["ws"],
    sources: Object.values(requireSources()),
    framework: "hono",
  });

  return (c: Context): HonoWSEvents => {
    tryDiscoverAppOrigin(c.req.raw);
    let adapter: ReturnType<typeof createSocketAdapter>;

    return {
      onOpen(_event, ws) {
        adapter = createSocketAdapter(ws);
        wsHandler.handleSocket(adapter, c.req.raw);
      },
      onMessage(event) {
        const data = typeof event.data === "string" ? event.data : String(event.data);
        adapter?.emit("message", { data });
      },
      onClose(event) {
        adapter?.emit("close", { code: event.code });
      },
      onError(event) {
        adapter?.emit("error", event);
      },
    };
  };
}
