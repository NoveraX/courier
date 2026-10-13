import type { Server } from "node:http";
import type { ConnectResult, WSHandlerConfig } from "@noverax/courier";
import { createWSHandler } from "@noverax/courier";
import { announceWhenRegistered } from "@noverax/courier/announce";
import {
  attachWebSocketUpgrade,
  DEFAULT_WS_PATH,
  extractOriginFromNodeRequest,
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
 * Attach Courier WebSocket handler to a NestJS application's HTTP server.
 * Requires `ws` package as peer dependency.
 *
 * @param server - HTTP server from `app.getHttpServer()`
 * @param options - WS handler options (heartbeat, allowedOrigins, etc.) and the `path` to listen on
 * @returns Detaches the handler: accepted connections are closed with 1012,
 *   which a Courier client answers by reconnecting later, and the handler's
 *   subscriptions are released. Call it before closing the HTTP server, which
 *   otherwise waits on those connections.
 *
 * @example
 * ```ts
 * import { attachRuntime } from "@noverax/courier-studio-core/runtime";
 * import { courierWSAttach } from "@noverax/courier-nestjs";
 *
 * const app = await NestFactory.create(AppModule);
 * await attachRuntime();
 * const cleanup = courierWSAttach(app.getHttpServer());
 * await app.listen(3000);
 * ```
 */
export function courierWSAttach<TConnect extends ConnectResult = ConnectResult>(
  server: Server,
  options: CourierWSAttachOptions<TConnect> = {},
): () => Promise<void> {
  const { path = DEFAULT_WS_PATH, ...handlerOptions } = options;
  const wsHandler = createWSHandler(handlerOptions);
  const announce = announceWhenRegistered({ transports: ["ws"], framework: "nestjs" });

  const detach = attachWebSocketUpgrade(server, {
    path,
    maxPayload: wsFrameLimit(handlerOptions.maxMessageSize),
    createServer: async (serverOptions) => new (await import("ws")).WebSocketServer(serverOptions),
    onRequest: (request) => {
      announce(extractOriginFromNodeRequest(request));
    },
    onSocket: (socket, request) => wsHandler.handleSocket(socket, request),
  });

  return async () => {
    detach();
    await wsHandler.destroy();
  };
}
