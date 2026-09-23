import type { Server } from "node:http";
import type { CourierWSOptions } from "@noverax/courier";
import { createWSHandler, requireSources } from "@noverax/courier";
import { announceHosting } from "@noverax/courier/announce";
import { attachWebSocketUpgrade, DEFAULT_WS_PATH } from "@noverax/courier/node";
import { tryDiscoverAppOrigin } from "./discover-origin";

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
export function courierWSAttach(server: Server, options: CourierWSAttachOptions = {}): () => void {
  const { path = DEFAULT_WS_PATH, ...handlerOptions } = options;
  const wsHandler = createWSHandler(handlerOptions);
  announceHosting({
    transports: ["ws"],
    sources: Object.values(requireSources()),
    framework: "express",
  });

  return attachWebSocketUpgrade(server, {
    path,
    maxPayload: handlerOptions.maxMessageSize,
    createServer: async (serverOptions) => new (await import("ws")).WebSocketServer(serverOptions),
    onRequest: tryDiscoverAppOrigin,
    onSocket: (socket, request) => wsHandler.handleSocket(socket, request),
  });
}
