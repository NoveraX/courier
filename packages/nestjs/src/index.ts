import type { IncomingMessage, ServerResponse } from "node:http";
import { createHandler } from "@noverax/nexus";
import type { Sources } from "@noverax/nexus/define";
import { sendWebResponse, toWebRequest } from "@noverax/nexus/node";

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
export function nexusMiddleware(sources: Sources) {
  const { handle } = createHandler(sources);

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
