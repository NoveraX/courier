import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Answer `/health` and `/readyz`.
 *
 * They are matched by path: the whole request target used to be compared, so
 * a probe that added a query string — a cache buster, a probe id — fell
 * through to the proxy and was refused with 400.
 *
 * @param req - The incoming request
 * @param res - The response being prepared
 * @param shuttingDown - Whether the server is draining, which `/readyz` reports
 * @returns Whether the request was a health check, answered here
 *
 * @example
 * ```ts
 * if (handleHealth(req, res, draining)) return;
 * ```
 */
export function handleHealth(
  req: IncomingMessage,
  res: ServerResponse,
  shuttingDown: boolean,
): boolean {
  const path = req.url?.split("?", 1)[0];
  if (path === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return true;
  }
  if (path === "/readyz") {
    res.writeHead(shuttingDown ? 503 : 200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: shuttingDown ? "draining" : "ready" }));
    return true;
  }
  return false;
}
