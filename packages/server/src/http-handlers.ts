import type { IncomingMessage, ServerResponse } from "node:http";

import type { AdapterHandler } from "@noverax/courier";
import { createLogger, isOriginAccepted } from "@noverax/courier";
import { sendWebResponse, toWebRequest } from "@noverax/courier/node";

const log = createLogger("Server");

/** Handle /health and /readyz endpoints. Returns true if handled. */
export function handleHealth(
  req: IncomingMessage,
  res: ServerResponse,
  shuttingDown: boolean,
): boolean {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return true;
  }
  if (req.url === "/readyz") {
    const status = shuttingDown ? 503 : 200;
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: shuttingDown ? "draining" : "ready" }));
    return true;
  }
  return false;
}

/**
 * Answer a preflight, refuse a foreign origin, and — on a request that is
 * allowed to proceed — say so on the response itself.
 *
 * Only the preflight used to carry `Access-Control-Allow-Origin`, so a
 * configured cross-origin caller passed the check and then could not read the
 * answer: the browser saw a response with no permission on it. The matcher is
 * the core's, so `*.example.com` means here what it means everywhere else.
 *
 * @param req - The incoming request
 * @param res - The response being prepared
 * @param allowedOrigins - Origins to accept besides the server's own
 * @returns Whether the request was fully handled here
 */
export function handleCors(
  req: IncomingMessage,
  res: ServerResponse,
  allowedOrigins?: string[],
): boolean {
  const origin = req.headers.origin;
  const allowed = isOriginAccepted(origin, selfOrigin(req), allowedOrigins);

  if (req.method === "OPTIONS" && origin) {
    if (!allowed) {
      res.writeHead(403);
      res.end();
      return true;
    }
    res.writeHead(204, {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Last-Event-ID",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    });
    res.end();
    return true;
  }

  if (!allowed) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Origin not allowed" }));
    return true;
  }

  if (origin) {
    /* The browser needs this on the answer, not only on the preflight. */
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }

  return false;
}

/** The origin this request was addressed to, from the Host it named. */
function selfOrigin(req: IncomingMessage): string | null {
  const host = req.headers.host;
  if (!host) return null;
  const socket = req.socket as { encrypted?: boolean } | undefined;
  return `${socket?.encrypted ? "https" : "http"}://${host}`;
}

/**
 * Answer an HTTP request: health checks, CORS, then the Courier handler.
 *
 * @param handler - The Courier request handler
 * @param allowedOrigins - Origins allowed to call cross-origin
 * @param isShuttingDown - Whether the server is draining
 * @returns A listener for `http.createServer`
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
      await sendWebResponse(webRes, res);
    } catch (err) {
      log.error("Request handler error", err);
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  };
}
