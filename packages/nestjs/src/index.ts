import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import type { HandlerConfig, NexusWSOptions } from "@noverax/nexus";
import {
  createHandler,
  createLogger,
  createWSHandler,
  getAppOrigin,
  requireSources,
  setAppOrigin,
} from "@noverax/nexus";
import { announceHosting } from "@noverax/nexus/announce";
import { extractOriginFromNodeRequest, sendWebResponse, toWebRequest } from "@noverax/nexus/node";
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
 * Create a NestJS-compatible middleware function for the nexus proxy.
 *
 * Sources are read from the core global registry populated by
 * `attachRuntime()` — call `await attachRuntime()` in your bootstrap
 * before the Nest application starts handling requests.
 *
 * @example
 * ```ts
 * import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
 * import { nexusMiddleware } from "@noverax/nexus-nestjs";
 *
 * @Module({})
 * export class AppModule implements NestModule {
 *   configure(consumer: MiddlewareConsumer) {
 *     consumer.apply(nexusMiddleware()).forRoutes("/api/request");
 *   }
 * }
 * ```
 */
export function nexusMiddleware(config?: HandlerConfig) {
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
 * consumer.apply(nexusSSEMiddleware()).forRoutes("/api/sse");
 * ```
 */
export function nexusSSEMiddleware(config?: HandlerConfig) {
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
 * Attach Nexus WebSocket handler to a NestJS application's HTTP server.
 * Requires `ws` package as peer dependency.
 *
 * @param server - HTTP server from `app.getHttpServer()`
 * @param options - WS handler options (heartbeat, allowedOrigins, etc.)
 * @returns Cleanup function — call to detach the upgrade handler
 *
 * @example
 * ```ts
 * import { attachRuntime } from "@noverax/nexus-studio-core/runtime";
 * import { nexusWSAttach } from "@noverax/nexus-nestjs";
 *
 * const app = await NestFactory.create(AppModule);
 * await attachRuntime();
 * const cleanup = nexusWSAttach(app.getHttpServer());
 * await app.listen(3000);
 * ```
 */
export function nexusWSAttach(server: Server, options?: NexusWSOptions): () => void {
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
