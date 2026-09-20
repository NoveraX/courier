import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import type { CourierWSOptions, HandlerConfig } from "@noverax/courier";
import {
  createHandler,
  createLogger,
  createWSHandler,
  getAppOrigin,
  requireSources,
  setAppOrigin,
} from "@noverax/courier";
import { announceHosting } from "@noverax/courier/announce";
import { extractOriginFromNodeRequest, sendWebResponse, toWebRequest } from "@noverax/courier/node";
import type { WebSocketServer } from "ws";

const log = createLogger("NestJS");

/**
 * Module-level first-request flag for `listenOrigin` auto-discovery.
 * NestJS middlewares stamp `appOrigin` from the first request's `Host`
 * header when no config/env value is present. Config-supplied or
 * env-var values take precedence and are never overwritten.
 */
let firstRequestHandled = false;

function tryDiscoverAppOrigin(req: IncomingMessage): void {
  if (firstRequestHandled) return;
  firstRequestHandled = true;
  if (getAppOrigin()) return;
  const origin = extractOriginFromNodeRequest(req);
  if (origin) setAppOrigin(origin);
}

/**
 * Create a NestJS-compatible middleware function for the courier proxy.
 *
 * Sources are read from the core global registry populated by
 * `attachRuntime()` — call `await attachRuntime()` in your bootstrap
 * before the Nest application starts handling requests.
 *
 * @example
 * ```ts
 * import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
 * import { courierMiddleware } from "@noverax/courier-nestjs";
 *
 * @Module({})
 * export class AppModule implements NestModule {
 *   configure(consumer: MiddlewareConsumer) {
 *     consumer.apply(courierMiddleware()).forRoutes("/api/request");
 *   }
 * }
 * ```
 */
export function courierMiddleware(
  config?: HandlerConfig,
): (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => Promise<void> {
  const { handle } = createHandler(config);
  announceHosting({
    transports: ["http"],
    sources: Object.values(requireSources()),
    framework: "nestjs",
  });

  return async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    tryDiscoverAppOrigin(req);
    try {
      const webReq = toWebRequest(req);
      const webRes = await handle(webReq);
      await sendWebResponse(webRes, res);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Create a NestJS-compatible middleware for SSE streaming endpoints.
 *
 * @example
 * ```ts
 * consumer.apply(courierSSEMiddleware()).forRoutes("/api/sse");
 * ```
 */
export function courierSSEMiddleware(
  config?: HandlerConfig,
): (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => Promise<void> {
  const { handleSSE } = createHandler(config);
  announceHosting({
    transports: ["sse"],
    sources: Object.values(requireSources()),
    framework: "nestjs",
  });

  return async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    tryDiscoverAppOrigin(req);
    try {
      const webReq = toWebRequest(req);
      const webRes = await handleSSE(webReq);
      await sendWebResponse(webRes, res);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Attach Courier WebSocket handler to a NestJS application's HTTP server.
 * Requires `ws` package as peer dependency.
 *
 * @param server - HTTP server from `app.getHttpServer()`
 * @param options - WS handler options (heartbeat, allowedOrigins, etc.)
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
export function courierWSAttach(server: Server, options?: CourierWSOptions): () => void {
  const wsHandler = createWSHandler(options);
  announceHosting({
    transports: ["ws"],
    sources: Object.values(requireSources()),
    framework: "nestjs",
  });
  let wss: WebSocketServer | undefined;

  const onUpgrade = async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on("error", (err) => log.warn("WS upgrade socket error", err));
    tryDiscoverAppOrigin(req);

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
