import type { HandlerConfig, NexusWSOptions } from "@noverax/nexus";
import { createHandler, createWSHandler } from "@noverax/nexus";
import type { Sources } from "@noverax/nexus/define";
import type { Context } from "hono";
import type { HonoWSContext } from "./ws-adapter";
import { createSocketAdapter } from "./ws-adapter";

/**
 * Create a Hono handler for the nexus proxy.
 *
 * @example
 * ```ts
 * import { Hono } from "hono";
 * import { nexusHandler } from "@noverax/nexus-hono";
 *
 * const app = new Hono();
 * app.all("/api/request", nexusHandler(sources));
 * ```
 */
export function nexusHandler(sources: Sources, config?: HandlerConfig) {
  const { handle } = createHandler(sources, config);
  return (c: Context) => handle(c.req.raw);
}

/**
 * Create a Hono handler for SSE streaming endpoints.
 *
 * @example
 * ```ts
 * app.get("/api/sse", nexusSSEHandler(sources));
 * ```
 */
export function nexusSSEHandler(sources: Sources, config?: HandlerConfig) {
  const { handleSSE } = createHandler(sources, config);
  return (c: Context) => handleSSE(c.req.raw);
}

/** Hono WS event handlers — structurally compatible with upgradeWebSocket() */
export type HonoWSEvents = {
  onOpen?(event: unknown, ws: HonoWSContext): void;
  onMessage?(event: { data: string | ArrayBuffer }, ws: HonoWSContext): void;
  onClose?(event: { code: number }, ws: HonoWSContext): void;
  onError?(event: unknown, ws: HonoWSContext): void;
};

/**
 * Create Hono WebSocket event handlers for Nexus realtime.
 * Use with your runtime's upgradeWebSocket helper.
 *
 * @param sources - Registered API sources
 * @param options - WS handler options (heartbeat, allowedOrigins, etc.)
 * @returns Factory that produces WSEvents per connection
 *
 * @example Node.js
 * ```ts
 * import { createNodeWebSocket } from "@hono/node-ws";
 * const { upgradeWebSocket } = createNodeWebSocket({ app });
 *
 * const ws = nexusWSHandler(sources);
 * app.get("/ws", upgradeWebSocket((c) => ws(c)));
 * ```
 */
export function nexusWSHandler(
  sources: Sources,
  options?: NexusWSOptions,
): (c: Context) => HonoWSEvents {
  const wsHandler = createWSHandler({ sources, ...options });

  return (c: Context): HonoWSEvents => {
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
