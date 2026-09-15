import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { createHandler, createLogger, createWSHandler, registerSources } from "@noverax/courier";
import { announceHosting } from "@noverax/courier/announce";
import { sendWebResponse, toWebRequest } from "@noverax/courier/node";
import type { WebSocketServer } from "ws";

import { handleCors, handleHealth } from "./http-handlers";
import { createShutdown, setupSignalHandlers } from "./shutdown";
import type { CourierServer, CourierServerConfig } from "./types";

const log = createLogger("Server");

const DEFAULT_PORT = 3001;
const DEFAULT_HOST = "localhost";
const DEFAULT_MAX_PAYLOAD = 65_536;

/**
 * Create a standalone HTTP + WebSocket server for Courier.
 * Handles GET/POST/SSE via createHandler and WS upgrades via createWSHandler.
 *
 * @param config — server configuration with sources, port, CORS, WS options
 * @returns CourierServer with `url`, `stop()`, and connection registries
 *
 * @example
 * ```ts
 * const server = createCourierServer({ sources: { api }, port: 3001 });
 * // server.url → "http://localhost:3001"
 * // server.sseConnections.count → active SSE streams
 * // await server.stop() — graceful shutdown
 * ```
 */
export function createCourierServer(config: CourierServerConfig): CourierServer {
  const {
    sources,
    port = DEFAULT_PORT,
    host = DEFAULT_HOST,
    allowedOrigins,
    pubsub,
    heartbeatIntervalMs,
    heartbeatTimeoutMs,
    maxPayload = DEFAULT_MAX_PAYLOAD,
    signals = true,
    onReady,
    onConnect,
    onDisconnect,
    onError,
  } = config;

  // Standalone server publishes sources into the core global registry so
  // `createHandler()` and `createWSHandler()` read them lazily via
  // `requireSources()` at request time. This matches the zero-arg adapter
  // handler convention (`courierHandler()` / `apiRoute()`) — the registry is
  // the single source of truth for in-process source lookup.
  registerSources(sources);

  const handler = createHandler({
    sseHeaders: config.sseHeaders,
    sseMaxLifetimeMs: config.sseMaxLifetimeMs,
    maxSSEConnections: config.maxSSEConnections,
    onSSEConnect: config.onSSEConnect,
    onSSEDisconnect: config.onSSEDisconnect,
    onSSEError: config.onSSEError,
  });
  const wsHandler = createWSHandler({
    pubsub,
    heartbeatIntervalMs,
    heartbeatTimeoutMs,
    allowedOrigins,
    onConnect,
    onDisconnect,
    onError,
  });

  let wss: WebSocketServer | undefined;
  let shuttingDown = false;

  const result: CourierServer = {
    url: `http://${host}:${port}`,
    stop: wrappedStop,
    sseConnections: handler.sseConnections,
    wsConnections: wsHandler.connections,
  };

  const httpServer = createServer(async (req, res) => {
    if (handleHealth(req, res, shuttingDown)) return;
    if (handleCors(req, res, allowedOrigins)) return;

    try {
      const webReq = toWebRequest(req);
      const webRes = await handler.handle(webReq);
      await sendWebResponse(webRes, res);
    } catch (err) {
      log.error("Request handler error", err);
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  });

  httpServer.on("upgrade", async (req, socket, head) => {
    if (shuttingDown) {
      socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
      socket.destroy();
      return;
    }

    socket.on("error", (err) => log.warn("Socket error during upgrade", err));

    if (!wss) {
      const { WebSocketServer } = await import("ws");
      wss = new WebSocketServer({ noServer: true, maxPayload });
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      const webReq = toWebRequest(req);
      wsHandler.handleSocket(ws, webReq);
    });
  });

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      log.error(`Port ${port} is already in use`);
      process.exit(1);
    }
    throw err;
  });

  const stop = createShutdown(
    httpServer,
    () => wss,
    () => handler,
  );

  httpServer.listen(port, host, () => {
    const addr = httpServer.address() as AddressInfo;
    result.url = `http://${host}:${addr.port}`;
    log.info(`Listening on ${result.url}`);
    announceHosting({
      transports: ["http", "sse", "ws"],
      sources: Object.values(sources),
      listenOrigin: result.url,
      framework: "standalone",
    });
    onReady?.(result.url);
  });

  async function wrappedStop(): Promise<void> {
    shuttingDown = true;
    await wsHandler.destroy();
    await stop();
  }

  if (signals) setupSignalHandlers(wrappedStop);

  return result;
}
