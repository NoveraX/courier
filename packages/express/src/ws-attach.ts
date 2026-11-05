import type { Server } from "node:http";
import type { ConnectResult, WSHandlerConfig } from "@noverax/courier";
import { createWSHandler } from "@noverax/courier";
import { announceWhenRegistered } from "@noverax/courier/announce";
import {
  attachWebSocketUpgrade,
  DEFAULT_WS_PATH,
  serverOriginOf,
  wsFrameLimit,
} from "@noverax/courier/node";

/** Options for `courierWSAttach`: the WebSocket handler's, plus where it listens. */
export interface CourierWSAttachOptions<TConnect extends ConnectResult = ConnectResult>
  extends WSHandlerConfig<TConnect> {
  /**
   * Pathname to answer upgrades on — the `proxyPath.ws` the client connects
   * to. Upgrades on any other path are left to the application's own
   * handlers. Defaults to `/api/ws`.
   */
  path?: string | undefined;
}

/**
 * Attach Courier WebSocket handler to an HTTP server.
 * Requires `ws` package as peer dependency.
 *
 * @param server - Node.js HTTP server (e.g. `http.createServer(app)`)
 * @param options - WS handler options (heartbeat, allowedOrigins, etc.) and the `path` to listen on
 * @returns Stops the handler: upgrades are answered 503 from then on, each
 *   connection is closed with 1012 — which a Courier client answers by
 *   reconnecting later — and waited for up to 5 seconds, one whose client
 *   has not answered by then is ended, and the handler's subscriptions are
 *   let go of; it settles within that time, whatever the clients and the
 *   pub/sub adapter do. Call it before closing the HTTP server, which
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
export function courierWSAttach<TConnect extends ConnectResult = ConnectResult>(
  server: Server,
  options: CourierWSAttachOptions<TConnect> = {},
): () => Promise<void> {
  const { path = DEFAULT_WS_PATH, ...handlerOptions } = options;
  const wsHandler = createWSHandler(handlerOptions);
  const announce = announceWhenRegistered({ transports: ["ws"], framework: "express" });

  let accepting = true;
  const detach = attachWebSocketUpgrade(server, {
    path,
    isAccepting: () => accepting,
    maxPayload: wsFrameLimit(handlerOptions.maxMessageSize),
    createServer: async (serverOptions) => new (await import("ws")).WebSocketServer(serverOptions),
    onRequest: (request) => {
      announce(serverOriginOf(request.socket));
    },
    onSocket: (socket, request) => wsHandler.handleSocket(socket, request),
  });

  /* No new socket while the ones held drain; what has not closed by then is ended by the detach. */
  return async () => {
    accepting = false;
    await wsHandler.destroy();
    detach();
  };
}
