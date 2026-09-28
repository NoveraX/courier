import type { CourierWSOptions, HandlerConfig } from "@noverax/courier";
import {
  createHandler,
  createWSHandler,
  discoverAppOrigin,
  requireSources,
} from "@noverax/courier";
import { announceHosting } from "@noverax/courier/announce";
import type { Context } from "hono";
import { peerAddressOf } from "./peer-address";
import type { HonoWSContext } from "./ws-adapter";
import { createSocketAdapter, frameText } from "./ws-adapter";

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
export function courierHandler(config?: HandlerConfig): (c: Context) => Promise<Response> {
  const { handle } = createHandler(config);
  announceHosting({
    transports: ["http"],
    sources: Object.values(requireSources()),
    framework: "hono",
  });
  return (c: Context) => {
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
  announceHosting({
    transports: ["sse"],
    sources: Object.values(requireSources()),
    framework: "hono",
  });
  return (c: Context) => {
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
export function courierWSHandler(options?: CourierWSOptions): (c: Context) => HonoWSEvents {
  const wsHandler = createWSHandler(options);
  announceHosting({
    transports: ["ws"],
    sources: Object.values(requireSources()),
    framework: "hono",
  });

  return (c: Context): HonoWSEvents => {
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
