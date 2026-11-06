import type { Server } from "node:http";
import { announceWhenRegistered } from "@noverax/courier/announce";
import {
  attachWebSocketUpgrade,
  DEFAULT_WS_PATH,
  serverOriginOf,
  wsFrameLimit,
} from "@noverax/courier/node";
import type { ConnectResult, WSHandlerConfig, WSHandlerDescriptor } from "@noverax/courier/server";
import { createWSHandler } from "@noverax/courier/server";

/**
 * What `courierWSAttach` returns: the cleanup to call before closing the
 * HTTP server — `await cleanup()`, as before — carrying the handler's
 * `connections`, its `destroy({ timeoutMs })` and its `stats()`.
 */
export type CourierWSAttachment = (() => Promise<void>) & WSHandlerDescriptor;

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
 * @returns Stops the handler: upgrades are answered 503 from then on, each
 *   connection is closed with 1001 after a `disconnect` frame that tells its
 *   client when to come back — a pause drawn across 5 seconds, so its
 *   clients do not all return at once — and waited for up to 5 seconds, one
 *   whose client has not answered by then is ended, and the handler's
 *   subscriptions are let go of; it settles within that time, whatever the
 *   clients and the pub/sub adapter do. Call it before closing the HTTP
 *   server, which otherwise waits on those connections. It carries the
 *   handler's `connections` — to send, broadcast or disconnect — its
 *   `destroy({ timeoutMs })`, the same stop with a deadline of your own,
 *   and its `stats()`.
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
): CourierWSAttachment {
  const { path = DEFAULT_WS_PATH, ...handlerOptions } = options;
  const wsHandler = createWSHandler(handlerOptions);
  const announce = announceWhenRegistered({ transports: ["ws"], framework: "nestjs" });

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

  /* No new socket while the ones held drain; what has not closed by then
     is ended by the detach. A second call is the same stop. */
  let stopping: Promise<void> | undefined;
  function destroy(options?: { timeoutMs?: number | undefined }): Promise<void> {
    accepting = false;
    stopping ??= wsHandler.destroy(options).then(detach);
    return stopping;
  }

  return Object.assign(() => destroy(), {
    connections: wsHandler.connections,
    destroy,
    stats: () => wsHandler.stats(),
  });
}
