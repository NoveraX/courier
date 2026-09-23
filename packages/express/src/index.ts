import type { IncomingMessage, ServerResponse } from "node:http";
import type { HandlerConfig } from "@noverax/courier";
import { createHandler, requireSources } from "@noverax/courier";
import { announceHosting } from "@noverax/courier/announce";
import { discoverNodeAppOrigin, sendWebResponse, toWebRequest } from "@noverax/courier/node";

export { type CourierWSAttachOptions, courierWSAttach } from "./ws-attach";

/**
 * Create an Express middleware handler for the courier proxy.
 *
 * Sources are read from the core global registry populated by
 * `attachRuntime()` — call `await attachRuntime()` in your server
 * instrumentation before mounting adapter handlers.
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
 *
 * Note: Do NOT apply body-parsing middleware (express.json(), multer)
 * to this route — the handler reads the raw request body itself.
 */
export function courierHandler(
  config?: HandlerConfig,
): (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => Promise<void> {
  const { handle } = createHandler(config);
  announceHosting({
    transports: ["http"],
    sources: Object.values(requireSources()),
    framework: "express",
  });

  return async (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => {
    discoverNodeAppOrigin(req);
    try {
      const webReq = toWebRequest(req, res);
      const webRes = await handle(webReq);
      await sendWebResponse(webRes, res);
    } catch (error) {
      if (next) {
        next(error);
      } else {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ success: false, message: "Internal server error" }));
      }
    }
  };
}

/**
 * Create an Express middleware handler for SSE streaming endpoints.
 *
 * @example
 * ```ts
 * app.get("/api/sse", courierSSEHandler());
 * ```
 *
 * Note: Do NOT apply compression middleware to this route —
 * SSE requires unbuffered streaming.
 */
export function courierSSEHandler(
  config?: HandlerConfig,
): (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => Promise<void> {
  const { handleSSE } = createHandler(config);
  announceHosting({
    transports: ["sse"],
    sources: Object.values(requireSources()),
    framework: "express",
  });

  return async (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => {
    discoverNodeAppOrigin(req);
    try {
      const webReq = toWebRequest(req, res);
      const webRes = await handleSSE(webReq);
      await sendWebResponse(webRes, res);
    } catch (error) {
      if (next) {
        next(error);
      } else {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ success: false, message: "Internal server error" }));
      }
    }
  };
}
