import type { Server } from "node:http";
import type { CourierWSOptions } from "@noverax/courier";
import { createWSHandler } from "@noverax/courier";
import { announceWhenRegistered } from "@noverax/courier/announce";
import {
  attachWebSocketUpgrade,
  DEFAULT_WS_PATH,
  discoverNodeAppOrigin,
} from "@noverax/courier/node";

/** Options for `courierWSAttach`: the WebSocket handler's, plus where it listens. */
export interface CourierWSAttachOptions extends CourierWSOptions {
  /**
   * Pathname to answer upgrades on — the `proxyPath.ws` the client connects
   * to. Upgrades on any other path are left to the application's own
   * handlers. Defaults to `/api/ws`.
   */
  path?: string;
}

/**
 * Attach Courier WebSocket handler to an HTTP server.
 * Requires `ws` package as peer dependency.
 *
 * @param server - Node.js HTTP server (e.g. `http.createServer(app)`)
 * @param options - WS handler options (heartbeat, allowedOrigins, etc.) and the `path` to listen on
 * @returns Detaches the handler: accepted connections are closed with 1012,
 *   which a Courier client answers by reconnecting later, and the handler's
 *   subscriptions are released. Call it before closing the HTTP server, which
 *   otherwise waits on those connections.
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
export function courierWSAttach(
  server: Server,
  options: CourierWSAttachOptions = {},
): () => Promise<void> {
  const { path = DEFAULT_WS_PATH, ...handlerOptions } = options;
  const wsHandler = createWSHandler(handlerOptions);
  const announce = announceWhenRegistered({ transports: ["ws"], framework: "express" });

  const detach = attachWebSocketUpgrade(server, {
    path,
    maxPayload: handlerOptions.maxMessageSize,
    createServer: async (serverOptions) => new (await import("ws")).WebSocketServer(serverOptions),
    onRequest: (request) => {
      announce();
      discoverNodeAppOrigin(request);
    },
    onSocket: (socket, request) => wsHandler.handleSocket(socket, request),
  });

  return async () => {
    detach();
    await wsHandler.destroy();
  };
}
