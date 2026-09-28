import type { HandlerConfig, WSHandlerConfig } from "@noverax/courier";
import { createHandler, createWSHandler, discoverAppOrigin } from "@noverax/courier";
import { announceWhenRegistered } from "@noverax/courier/announce";
import type { Context } from "hono";
import { peerAddressOf } from "./peer-address";
import type { HonoWSContext } from "./ws-adapter";
import { createSocketAdapter, frameText } from "./ws-adapter";

/**
 * Create a Hono handler for the courier proxy.
 *
 * Sources are read from the core global registry populated by
 * `attachRuntime()` — call `await attachRuntime()` in your server
 * instrumentation before the first request. The handler itself can be
 * created earlier: it reads the registry when it serves a request.
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
export function courierHandler(config?: HandlerConfig): (c: Context) => Promise<Response> {
  const { handle } = createHandler(config);
  const announce = announceWhenRegistered({ transports: ["http"], framework: "hono" });
  return (c: Context) => {
    announce();
    discoverAppOrigin(new URL(c.req.raw.url).origin);
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
export function courierSSEHandler(config?: HandlerConfig): (c: Context) => Promise<Response> {
  const { handleSSE } = createHandler(config);
  const announce = announceWhenRegistered({ transports: ["sse"], framework: "hono" });
  return (c: Context) => {
    announce();
    discoverAppOrigin(new URL(c.req.raw.url).origin);
    return handleSSE(c.req.raw);
  };
}

/** Hono WS event handlers — structurally compatible with upgradeWebSocket() */
export type HonoWSEvents = {
  onOpen?(event: unknown, ws: HonoWSContext): void;
  onMessage?(event: { data: unknown }, ws: HonoWSContext): void;
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
export function courierWSHandler(options?: WSHandlerConfig): (c: Context) => HonoWSEvents {
  const wsHandler = createWSHandler(options);
  const announce = announceWhenRegistered({ transports: ["ws"], framework: "hono" });

  return (c: Context): HonoWSEvents => {
    announce();
    discoverAppOrigin(new URL(c.req.raw.url).origin);
    let adapter: ReturnType<typeof createSocketAdapter>;

    return {
      onOpen(_event, ws) {
        adapter = createSocketAdapter(ws);
        wsHandler.handleSocket(adapter, c.req.raw, peerAddressOf(c));
      },
      onMessage(event) {
        const decoded = frameText(event.data);
        if (typeof decoded === "string") {
          adapter?.emit("message", { data: decoded });
          return;
        }
        decoded.then((data) => adapter?.emit("message", { data }));
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
