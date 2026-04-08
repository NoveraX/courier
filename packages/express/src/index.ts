import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import type { HandlerConfig, NexusWSOptions } from "@noverax/nexus";
import { createHandler, createLogger, createWSHandler } from "@noverax/nexus";
import type { Sources } from "@noverax/nexus/define";
import { sendWebResponse, toWebRequest } from "@noverax/nexus/node";
import type { WebSocketServer } from "ws";

const log = createLogger("Express");

/**
 * Create an Express middleware handler for the nexus proxy.
 *
 * @example
 * ```ts
 * import express from "express";
 * import { nexusHandler } from "@noverax/nexus-express";
 *
 * const app = express();
 * app.all("/api/request", nexusHandler(sources));
 * ```
 *
 * Note: Do NOT apply body-parsing middleware (express.json(), multer)
 * to this route — the handler reads the raw request body itself.
 */
export function nexusHandler(sources: Sources, config?: HandlerConfig) {
  const { handle } = createHandler(sources, config);

  return async (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => {
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
 * app.get("/api/sse", nexusSSEHandler(sources));
 * ```
 *
 * Note: Do NOT apply compression middleware to this route —
 * SSE requires unbuffered streaming.
 */
export function nexusSSEHandler(sources: Sources, config?: HandlerConfig) {
  const { handleSSE } = createHandler(sources, config);

  return async (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => {
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
 * @param sources - Registered API sources
 * @param options - WS handler options (heartbeat, allowedOrigins, etc.)
 * @returns Cleanup function — call to detach the upgrade handler
 *
 * @example
 * ```ts
 * import http from "node:http";
 * import express from "express";
 * import { nexusHandler, nexusWSAttach } from "@noverax/nexus-express";
 *
 * const app = express();
 * const server = http.createServer(app);
 * app.all("/api/request", nexusHandler(sources));
 * const cleanup = nexusWSAttach(server, sources);
 * server.listen(3000);
 * ```
 */
export function nexusWSAttach(
  server: Server,
  sources: Sources,
  options?: NexusWSOptions,
): () => void {
  const wsHandler = createWSHandler({ sources, ...options });
  let wss: WebSocketServer | undefined;

  const onUpgrade = async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on("error", (err) => log.warn("WS upgrade socket error", err));

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
