import type { IncomingMessage, ServerResponse } from "node:http";

import type { AdapterHandler } from "@noverax/courier";
import { createLogger } from "@noverax/courier";
import { sendWebResponse, toWebRequest } from "@noverax/courier/node";

import { exposeHeaders, handleCors } from "./cors";
import { handleHealth } from "./health";
import { sendError } from "./send-error";

const log = createLogger("Server");

/**
 * Answer an HTTP request: health checks, CORS, then the Courier handler.
 *
 * @param handler - The Courier request handler
 * @param allowedOrigins - Origins allowed to call cross-origin
 * @param isShuttingDown - Whether the server is draining
 * @returns A listener for `http.createServer`
 *
 * @example
 * ```ts
 * createServer(createRequestListener(handler, allowedOrigins, () => draining));
 * ```
 */
export function createRequestListener(
  handler: AdapterHandler,
  allowedOrigins: string[] | undefined,
  isShuttingDown: () => boolean,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    if (handleHealth(req, res, isShuttingDown())) return;
    if (handleCors(req, res, allowedOrigins)) return;

    try {
      const webRes = await handler.handle(toWebRequest(req, res));
      exposeHeaders(res, webRes.headers);
      await sendWebResponse(webRes, res);
    } catch (err) {
      log.error("Request handler error", err);
      /* A response already under way cannot turn into an error answer; one
         appended to its body corrupted it. Its body broke off, and
         sendWebResponse has cut its connection. */
      if (!res.headersSent) sendError(res, 500, "Internal server error");
    }
  };
}
