import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import type { CourierWSOptions, HandlerConfig } from "@noverax/courier";
import {
  createHandler,
  createLogger,
  createWSHandler,
  getAppOrigin,
  requireSources,
  setAppOrigin,
} from "@noverax/courier";
import { announceHosting } from "@noverax/courier/announce";
import { extractOriginFromNodeRequest, sendWebResponse, toWebRequest } from "@noverax/courier/node";
import type { WebSocketServer } from "ws";

const log = createLogger("Express");

/**
 * Module-level first-request flag for `listenOrigin` auto-discovery.
 *
 * The first incoming HTTP request to any Express handler created by this
 * module stamps `appOrigin` with the origin extracted from its `Host`
 * header — but only when `appOrigin` is still unset. Config-supplied or
 * env-var values take precedence and are never overwritten.
 */
let firstRequestHandled = false;

function tryDiscoverAppOrigin(req: IncomingMessage): void {
  if (firstRequestHandled) return;
  firstRequestHandled = true;
  if (getAppOrigin()) return;
  const origin = extractOriginFromNodeRequest(req);
  if (origin) setAppOrigin(origin);
}

/**
 * Create an Express middleware handler for the courier proxy.
 *
 * Sources are read from the core global registry populated by
 * `attachRuntime()` — call `await attachRuntime()` in your server
 * instrumentation before mounting adapter handlers.
 *
 * @example
 * ```ts
 * import express from "express";
 * import { attachRuntime } from "@noverax/courier-studio-core/runtime";
 * import { courierHandler } from "@noverax/courier-express";
 *
 * const app = express();
 * await attachRuntime();
 * app.all("/api/request", courierHandler());
 * ```
 *
 * Note: Do NOT apply body-parsing middleware (express.json(), multer)
 * to this route — the handler reads the raw request body itself.
 */
export function courierHandler(
  config?: HandlerConfig,
): (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => Promise<void> {
  const { handle } = createHandler(config);
  announceHosting({
    transports: ["http"],
    sources: Object.values(requireSources()),
    framework: "express",
  });

  return async (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => {
    tryDiscoverAppOrigin(req);
    try {
      const webReq = toWebRequest(req);
      const webRes = await handle(webReq);
      await sendWebResponse(webRes, res);
    } catch (error) {
      if (next) {
        next(error);
      } else {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ success: false, message: "Internal server error" }));
      }
    }
  };
}

/**
 * Create an Express middleware handler for SSE streaming endpoints.
 *
 * @example
 * ```ts
 * app.get("/api/sse", courierSSEHandler());
 * ```
 *
 * Note: Do NOT apply compression middleware to this route —
 * SSE requires unbuffered streaming.
 */
export function courierSSEHandler(
  config?: HandlerConfig,
): (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => Promise<void> {
  const { handleSSE } = createHandler(config);
  announceHosting({
    transports: ["sse"],
    sources: Object.values(requireSources()),
    framework: "express",
  });

  return async (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => {
    tryDiscoverAppOrigin(req);
    try {
      const webReq = toWebRequest(req);
      const webRes = await handleSSE(webReq);
      await sendWebResponse(webRes, res);
    } catch (error) {
      if (next) {
        next(error);
      } else {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ success: false, message: "Internal server error" }));
      }
    }
  };
}

/**
 * Attach Courier WebSocket handler to an HTTP server.
 * Requires `ws` package as peer dependency.
 *
 * @param server - Node.js HTTP server (e.g. `http.createServer(app)`)
 * @param options - WS handler options (heartbeat, allowedOrigins, etc.)
 * @returns Cleanup function — call to detach the upgrade handler
 *
 * @example
 * ```ts
 * import http from "node:http";
 * import express from "express";
 * import { attachRuntime } from "@noverax/courier-studio-core/runtime";
 * import { courierHandler, courierWSAttach } from "@noverax/courier-express";
 *
 * const app = express();
 * const server = http.createServer(app);
 * await attachRuntime();
 * app.all("/api/request", courierHandler());
 * const cleanup = courierWSAttach(server);
 * server.listen(3000);
 * ```
 */
export function courierWSAttach(server: Server, options?: CourierWSOptions): () => void {
  const wsHandler = createWSHandler(options);
  announceHosting({
    transports: ["ws"],
    sources: Object.values(requireSources()),
    framework: "express",
  });
  let wss: WebSocketServer | undefined;

  const onUpgrade = async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on("error", (err) => log.warn("WS upgrade socket error", err));
    tryDiscoverAppOrigin(req);

    if (!wss) {
      const { WebSocketServer } = await import("ws");
      wss = new WebSocketServer({ noServer: true });
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wsHandler.handleSocket(ws, toWebRequest(req));
    });
  };

  server.on("upgrade", onUpgrade);

  return () => {
    server.off("upgrade", onUpgrade);
    wss?.close();
  };
}
