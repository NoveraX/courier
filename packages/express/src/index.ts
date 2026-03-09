import type { IncomingMessage, ServerResponse } from "node:http";
import { createHandler } from "@noverax/nexus";
import type { Sources } from "@noverax/nexus/define";
import { sendWebResponse, toWebRequest } from "@noverax/nexus/node";

/**
 * Create an Express middleware handler for the nexus proxy.
 *
 * @example
 * ```ts
 * import express from "express";
 * import { nexusHandler } from "@noverax/nexus-express";
 *
 * const app = express();
 * app.all("/api/request", nexusHandler(sources));
 * ```
 *
 * Note: Do NOT apply body-parsing middleware (express.json(), multer)
 * to this route — the handler reads the raw request body itself.
 */
export function nexusHandler(sources: Sources) {
  const { handle } = createHandler(sources);

  return async (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => {
    try {
      const webReq = toWebRequest(req);
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
