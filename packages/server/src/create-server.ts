import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { createHandler, createLogger, createWSHandler, registerSources } from "@noverax/courier";
import { announceHosting } from "@noverax/courier/announce";
import { attachWebSocketUpgrade } from "@noverax/courier/node";
import type { WebSocketServer } from "ws";

import { createRequestListener } from "./http-handlers";
import { createReadiness } from "./readiness";
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
    onServerError,
  } = config;

  // Standalone server publishes sources into the core global registry so
  // `createHandler()` and `createWSHandler()` read them lazily via
  // `requireSources()` at request time. This matches the zero-arg adapter
  // handler convention (`courierHandler()` / `apiRoute()`) — the registry is
  // the single source of truth for in-process source lookup.
  registerSources(sources);

  const handler = createHandler({
    allowedOrigins,
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

  const { ready, markListening, markFailed } = createReadiness();

  const result: CourierServer = {
    url: `http://${host}:${port}`,
    ready,
    stop: wrappedStop,
    sseConnections: handler.sseConnections,
    wsConnections: wsHandler.connections,
  };

  const httpServer = createServer(
    createRequestListener(handler, allowedOrigins, () => shuttingDown),
  );

  attachWebSocketUpgrade(httpServer, {
    /* This server hosts nothing but Courier, so every path is its own. */
    path: undefined,
    maxPayload,
    isAccepting: () => !shuttingDown,
    createServer: async (serverOptions) => {
      wss = new (await import("ws")).WebSocketServer(serverOptions);
      return wss;
    },
    onSocket: (socket, request) => wsHandler.handleSocket(socket, request),
  });

  /* A library does not decide that the host process should end. A failed
     listen is reported through `ready` and `onServerError`; the caller picks
     another port, retries, or gives up, and nothing else in the process dies
     because this server could not start. */
  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    const error =
      err.code === "EADDRINUSE" ? new Error(`Port ${port} is already in use`, { cause: err }) : err;

    log.error(error.message);
    onServerError?.(error);
    markFailed(error);
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
    markListening(result.url);
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
