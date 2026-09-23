import type { Server } from "node:http";
import type { CourierWSOptions } from "@noverax/courier";
import { createWSHandler, requireSources } from "@noverax/courier";
import { announceHosting } from "@noverax/courier/announce";
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
 * Attach Courier WebSocket handler to a NestJS application's HTTP server.
 * Requires `ws` package as peer dependency.
 *
 * @param server - HTTP server from `app.getHttpServer()`
 * @param options - WS handler options (heartbeat, allowedOrigins, etc.) and the `path` to listen on
 * @returns Cleanup function — call to detach the upgrade handler
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
export function courierWSAttach(server: Server, options: CourierWSAttachOptions = {}): () => void {
  const { path = DEFAULT_WS_PATH, ...handlerOptions } = options;
  const wsHandler = createWSHandler(handlerOptions);
  announceHosting({
    transports: ["ws"],
    sources: Object.values(requireSources()),
    framework: "nestjs",
  });

  return attachWebSocketUpgrade(server, {
    path,
    maxPayload: handlerOptions.maxMessageSize,
    createServer: async (serverOptions) => new (await import("ws")).WebSocketServer(serverOptions),
    onRequest: discoverNodeAppOrigin,
    onSocket: (socket, request) => wsHandler.handleSocket(socket, request),
  });
}
