import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import type { HandlerConfig, NexusWSOptions } from "@noverax/nexus";
import {
  createHandler,
  createLogger,
  createWSHandler,
  getAppOrigin,
  requireSources,
  setAppOrigin,
} from "@noverax/nexus";
import { announceHosting } from "@noverax/nexus/announce";
import { extractOriginFromNodeRequest, sendWebResponse, toWebRequest } from "@noverax/nexus/node";
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
 * Create an Express middleware handler for the nexus proxy.
 *
 * Sources are read from the core global registry populated by
 * `attachRuntime()` — call `await attachRuntime()` in your server
 * instrumentation before mounting adapter handlers.
 *
 * @example
 * ```ts
 * import express from "express";
 * import { attachRuntime } from "@noverax/nexus-studio-core/runtime";
 * import { nexusHandler } from "@noverax/nexus-express";
 *
 * const app = express();
 * await attachRuntime();
 * app.all("/api/request", nexusHandler());
 * ```
 *
 * Note: Do NOT apply body-parsing middleware (express.json(), multer)
 * to this route — the handler reads the raw request body itself.
 */
export function nexusHandler(config?: HandlerConfig) {
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
 * app.get("/api/sse", nexusSSEHandler());
 * ```
 *
 * Note: Do NOT apply compression middleware to this route —
 * SSE requires unbuffered streaming.
 */
export function nexusSSEHandler(config?: HandlerConfig) {
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
 * Attach Nexus WebSocket handler to an HTTP server.
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
 * import { attachRuntime } from "@noverax/nexus-studio-core/runtime";
 * import { nexusHandler, nexusWSAttach } from "@noverax/nexus-express";
 *
 * const app = express();
 * const server = http.createServer(app);
 * await attachRuntime();
 * app.all("/api/request", nexusHandler());
 * const cleanup = nexusWSAttach(server);
 * server.listen(3000);
 * ```
 */
export function nexusWSAttach(server: Server, options?: NexusWSOptions): () => void {
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
