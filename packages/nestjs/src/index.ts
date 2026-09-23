import type { IncomingMessage, ServerResponse } from "node:http";
import type { HandlerConfig } from "@noverax/courier";
import { createHandler, requireSources } from "@noverax/courier";
import { announceHosting } from "@noverax/courier/announce";
import { sendWebResponse, toWebRequest } from "@noverax/courier/node";
import { tryDiscoverAppOrigin } from "./discover-origin";

export { type CourierWSAttachOptions, courierWSAttach } from "./ws-attach";

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
      const webReq = toWebRequest(req, res);
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
      const webReq = toWebRequest(req, res);
      const webRes = await handleSSE(webReq);
      await sendWebResponse(webRes, res);
    } catch (error) {
      next(error);
    }
  };
}
