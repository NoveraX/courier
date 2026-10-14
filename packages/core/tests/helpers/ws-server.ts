import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";

import { createWSHandler } from "../../src/adapter/handle-ws";
import type { WSHandler, WSHandlerConfig } from "../../src/adapter/ws-types";
import { attachWebSocketUpgrade, type UpgradeServer } from "../../src/node";
import { clearWSConnectionPool } from "../../src/realtime/caller-ws";
import { _resetSourcesForTests, registerSources } from "../../src/sources";

/** A real HTTP server answering WebSocket upgrades with Courier's handler. */
export interface ServedWS {
  /** The URL a client connects to */
  url: string;
  handler: WSHandler;
  server: Server;
}

/**
 * Serve `endpoints` as the group `live` of the source `api` — topics read
 * `api.live.<name>` — on a real `ws` server bound to a free port.
 *
 * @param endpoints - Endpoints by name, as `.implement()` produces them
 * @param config - Handler options
 * @returns The server, its handler and the URL to connect to
 */
export async function serveWS(
  endpoints: Record<string, unknown>,
  config?: WSHandlerConfig,
): Promise<ServedWS> {
  registerSources({
    api: { options: { expose: true, groups: { live: { options: {}, ...endpoints } } } },
  } as never);
  const handler = createWSHandler(config);
  const server = createServer();
  attachWebSocketUpgrade(server, {
    path: "/api/ws",
    createServer: (options) => new WebSocketServer(options) as unknown as UpgradeServer,
    onSocket: (socket, request) => handler.handleSocket(socket, request),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `ws://127.0.0.1:${port}/api/ws`, handler, server };
}

/**
 * Close the client pool, forget the sources and stop the server.
 *
 * @param served - What `serveWS` returned, if it ran
 */
export async function stopWS(served: ServedWS | undefined): Promise<void> {
  clearWSConnectionPool();
  _resetSourcesForTests();
  if (!served) return;
  await served.handler.destroy();
  served.server.closeAllConnections();
  await new Promise<void>((resolve) => served.server.close(() => resolve()));
}

/** Resolve after `ms` milliseconds. */
export function settle(ms = 30): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
