import type { IncomingMessage } from "node:http";
import { createLogger } from "@noverax/courier";

const log = createLogger("Studio");

interface ErrorResponse {
  headersSent: boolean;
  status(code: number): ErrorResponse;
  json(data: unknown): void;
}

/* What the JSON parser throws for a body it refuses: a status and a type
   such as "entity.parse.failed" or "entity.too.large". */
function parserStatus(err: unknown): number | null {
  if (typeof err !== "object" || err === null || !("type" in err) || typeof err.type !== "string")
    return null;
  const status = "status" in err && typeof err.status === "number" ? err.status : null;
  return status !== null && status >= 400 && status < 500 ? status : null;
}

/**
 * Answer an API error as JSON. Without this, Express answers with an HTML
 * page carrying the error's stack and the absolute paths in it — to any
 * caller, before the routes' own checks have run.
 *
 * A body the JSON parser refuses gets its 4xx with a plain reason; anything
 * else a route let escape is logged and answered 500.
 *
 * @param err - What was thrown
 * @param _req - The request
 * @param res - The response
 * @param next - Hands the error on when the response has already begun
 */
export function apiErrors(
  err: unknown,
  _req: IncomingMessage,
  res: ErrorResponse,
  next: (err: unknown) => void,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  const status = parserStatus(err);
  if (status === 413) {
    res.status(413).json({ error: "The request body is larger than Studio accepts." });
    return;
  }
  if (status !== null) {
    res.status(status).json({ error: "The request body is not valid JSON." });
    return;
  }
  log.error("A Studio API request failed", err);
  res.status(500).json({ error: "Studio could not handle the request." });
}
