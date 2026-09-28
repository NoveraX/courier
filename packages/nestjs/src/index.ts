import type { IncomingMessage, ServerResponse } from "node:http";
import type { AdapterHandler, HandlerConfig } from "@noverax/courier";
import { createHandler, requireSources } from "@noverax/courier";
import { announceHosting } from "@noverax/courier/announce";
import { discoverNodeAppOrigin, sendWebResponse, toWebRequest } from "@noverax/courier/node";

import { bodyNestParsed } from "./parsed-body";

export { type CourierWSAttachOptions, courierWSAttach } from "./ws-attach";

/**
 * A NestJS middleware for Courier that can drain the SSE streams it serves.
 *
 * `app.close()` waits for every open connection, and a stream stays open
 * until its lifetime cap — 30 minutes by default — so the application calls
 * `shutdownSSE()` from `beforeApplicationShutdown`: each client gets a
 * `shutdown` event telling it when to reconnect, and the streams end.
 */
export type CourierNestMiddleware = ((
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => Promise<void>) &
  Pick<AdapterHandler, "sseConnections" | "shutdownSSE">;

/**
 * Create a NestJS-compatible middleware function for the courier proxy.
 *
 * Sources are read from the core global registry populated by
 * `attachRuntime()` — call `await attachRuntime()` in your bootstrap
 * before the Nest application starts handling requests.
 *
 * Nest's global body parser reads a JSON call before this middleware runs;
 * the proxy then takes the body from it — the exact bytes when the app is
 * created with `{ rawBody: true }`.
 *
 * @param config - Handler options, such as `allowedOrigins` or body limits
 * @returns A middleware for `consumer.apply(...)`, with `shutdownSSE()`
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
export function courierMiddleware(config?: HandlerConfig): CourierNestMiddleware {
  const handler = createHandler(config);
  announceHosting({
    transports: ["http"],
    sources: Object.values(requireSources()),
    framework: "nestjs",
  });
  return serve(handler, handler.handle);
}

/**
 * Create a NestJS-compatible middleware for SSE streaming endpoints.
 *
 * @param config - Handler options, such as `allowedOrigins` or stream lifetimes
 * @returns A middleware for `consumer.apply(...)`, with `shutdownSSE()`
 *
 * @example
 * ```ts
 * const sse = courierSSEMiddleware();
 *
 * @Module({})
 * export class AppModule implements NestModule, BeforeApplicationShutdown {
 *   configure(consumer: MiddlewareConsumer) {
 *     consumer.apply(sse).forRoutes("/api/sse");
 *   }
 *   beforeApplicationShutdown() {
 *     return sse.shutdownSSE();
 *   }
 * }
 * ```
 */
export function courierSSEMiddleware(config?: HandlerConfig): CourierNestMiddleware {
  const handler = createHandler(config);
  announceHosting({
    transports: ["sse"],
    sources: Object.values(requireSources()),
    framework: "nestjs",
  });
  return serve(handler, handler.handleSSE);
}

/** Bridge a Nest request to a Web handler and back, keeping its stream drain. */
function serve(
  handler: AdapterHandler,
  respond: (request: Request) => Promise<Response>,
): CourierNestMiddleware {
  const middleware = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: unknown) => void,
  ): Promise<void> => {
    discoverNodeAppOrigin(req);
    try {
      const webReq = toWebRequest(req, res, () => bodyNestParsed(req));
      await sendWebResponse(await respond(webReq), res);
    } catch (error) {
      next(error);
    }
  };
  return Object.assign(middleware, {
    sseConnections: handler.sseConnections,
    shutdownSSE: handler.shutdownSSE,
  });
}
