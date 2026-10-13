import type { IncomingMessage, ServerResponse } from "node:http";
import type { AdapterHandler, ConnectResult, HandlerConfig } from "@noverax/courier";
import { createHandler } from "@noverax/courier";
import { announceWhenRegistered } from "@noverax/courier/announce";
import { extractOriginFromNodeRequest, sendWebResponse, toWebRequest } from "@noverax/courier/node";

export { requestContext } from "./request-context";
export { type CourierWSAttachOptions, courierWSAttach } from "./ws-attach";

/** An Express middleware for Courier. */
export type CourierMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next?: (err?: unknown) => void,
) => Promise<void>;

/**
 * A Courier middleware that can drain the SSE streams it serves.
 *
 * `server.close()` waits for every open connection, and a stream stays open
 * until its lifetime cap — 30 minutes by default — so a host shutting down
 * calls `shutdownSSE()` first: each client gets a `shutdown` event telling
 * it when to reconnect, and the streams end.
 */
export type CourierExpressHandler = CourierMiddleware &
  Pick<AdapterHandler, "sseConnections" | "shutdownSSE">;

/**
 * Create an Express middleware handler for the courier proxy.
 *
 * Sources are read from the core global registry populated by
 * `attachRuntime()` — call `await attachRuntime()` in your server
 * instrumentation before the first request. The handler itself can be
 * created earlier: it reads the registry when it serves a request.
 *
 * Do not apply body-parsing middleware (`express.json()`, `multer`) to this
 * route — the handler reads the raw request body itself.
 *
 * @param config - Handler options, such as `allowedOrigins` or body limits
 * @returns The middleware, with `shutdownSSE()` for a host shutting down
 *
 * @example
 * ```ts
 * import express from "express";
 * import { attachRuntime } from "@noverax/courier-studio-core/runtime";
 * import { courierHandler } from "@noverax/courier-express";
 *
 * const app = express();
 * await attachRuntime();
 * app.all("/api/request", courierHandler());
 * ```
 */
export function courierHandler<TConnect extends ConnectResult = ConnectResult>(
  config?: HandlerConfig<TConnect>,
): CourierExpressHandler {
  const handler = createHandler(config);
  const announce = announceWhenRegistered({ transports: ["http"], framework: "express" });
  return drainable(handler, serve(handler.handle, announce));
}

/**
 * Create an Express middleware handler for SSE streaming endpoints.
 *
 * Do not apply compression middleware to this route — SSE requires
 * unbuffered streaming.
 *
 * @param config - Handler options, such as `allowedOrigins` or stream lifetimes
 * @returns The middleware, with `shutdownSSE()` for a host shutting down
 *
 * @example
 * ```ts
 * const sse = courierSSEHandler();
 * app.get("/api/sse", sse);
 *
 * process.on("SIGTERM", async () => {
 *   await sse.shutdownSSE();
 *   server.close();
 * });
 * ```
 */
export function courierSSEHandler<TConnect extends ConnectResult = ConnectResult>(
  config?: HandlerConfig<TConnect>,
): CourierExpressHandler {
  const handler = createHandler(config);
  const announce = announceWhenRegistered({ transports: ["sse"], framework: "express" });
  return drainable(handler, serve(handler.handleSSE, announce));
}

/** Bridge an Express request to a Web handler and back. */
function serve(
  respond: (request: Request) => Promise<Response>,
  announce: (addressedTo?: string) => void,
): CourierMiddleware {
  return async (req, res, next) => {
    announce(extractOriginFromNodeRequest(req));
    try {
      await sendWebResponse(await respond(toWebRequest(req, res)), res);
    } catch (error) {
      if (next) {
        next(error);
        return;
      }
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: false, message: "Internal server error" }));
    }
  };
}

/** Give a middleware its handler's stream registry and drain. */
function drainable(handler: AdapterHandler, middleware: CourierMiddleware): CourierExpressHandler {
  return Object.assign(middleware, {
    sseConnections: handler.sseConnections,
    shutdownSSE: handler.shutdownSSE,
  });
}
