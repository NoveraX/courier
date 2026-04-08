import type { IncomingMessage, ServerResponse } from "node:http";

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

/** Handle CORS preflight and origin validation. Returns true if handled. */
export function handleCors(
  req: IncomingMessage,
  res: ServerResponse,
  allowedOrigins?: string[],
): boolean {
  const origin = req.headers.origin;

  if (req.method === "OPTIONS" && origin) {
    const allowed = !allowedOrigins?.length || allowedOrigins.includes(origin);
    res.writeHead(allowed ? 204 : 403, {
      "Access-Control-Allow-Origin": allowed ? origin : "",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Last-Event-ID",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return true;
  }

  if (origin && allowedOrigins?.length && !allowedOrigins.includes(origin)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Origin not allowed" }));
    return true;
  }

  return false;
}
