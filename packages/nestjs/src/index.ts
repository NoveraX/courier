import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import type { HandlerConfig, NexusWSOptions } from "@noverax/nexus";
import { createHandler, createLogger, createWSHandler } from "@noverax/nexus";
import type { Sources } from "@noverax/nexus/define";
import { sendWebResponse, toWebRequest } from "@noverax/nexus/node";
import type { WebSocketServer } from "ws";

const log = createLogger("NestJS");

/**
 * Create a NestJS-compatible middleware function for the nexus proxy.
 *
 * @example
 * ```ts
 * import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
 * import { nexusMiddleware } from "@noverax/nexus-nestjs";
 *
 * @Module({})
 * export class AppModule implements NestModule {
 *   configure(consumer: MiddlewareConsumer) {
 *     consumer.apply(nexusMiddleware(sources)).forRoutes("/api/request");
 *   }
 * }
 * ```
 */
export function nexusMiddleware(sources: Sources, config?: HandlerConfig) {
  const { handle } = createHandler(sources, config);

  return async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
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
 * consumer.apply(nexusSSEMiddleware(sources)).forRoutes("/api/sse");
 * ```
 */
export function nexusSSEMiddleware(sources: Sources, config?: HandlerConfig) {
  const { handleSSE } = createHandler(sources, config);

  return async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
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
 * @param sources - Registered API sources
 * @param options - WS handler options (heartbeat, allowedOrigins, etc.)
 * @returns Cleanup function — call to detach the upgrade handler
 *
 * @example
 * ```ts
 * import { nexusWSAttach } from "@noverax/nexus-nestjs";
 *
 * const app = await NestFactory.create(AppModule);
 * const cleanup = nexusWSAttach(app.getHttpServer(), sources);
 * await app.listen(3000);
 * ```
 */
export function nexusWSAttach(
  server: Server,
  sources: Sources,
  options?: NexusWSOptions,
): () => void {
  const wsHandler = createWSHandler({ sources, ...options });
  let wss: WebSocketServer | undefined;

  const onUpgrade = async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on("error", (err) => log.warn("WS upgrade socket error", err));

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
