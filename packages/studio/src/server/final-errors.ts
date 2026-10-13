import { type IncomingMessage, type ServerResponse, STATUS_CODES } from "node:http";
import { createLogger } from "@noverax/courier";

const log = createLogger("Studio");

/* What a response that failed part-way may already say of a file it no longer sends. */
const FILE_HEADERS = [
  "Accept-Ranges",
  "Content-Disposition",
  "Content-Encoding",
  "Content-Language",
  "Content-Range",
  "ETag",
  "Expires",
  "Last-Modified",
] as const;

/**
 * Answer an error no route answered — a page's address whose escapes do
 * not decode, the page's file gone from disk, a failure past the API's own
 * handler — with its status, and the status's name as plain text. Express's
 * own answer is an HTML page carrying the error's stack, and the absolute
 * paths in it, to any caller, while it prints the stack in the terminal for
 * every such request; `/api` keeps its JSON answers, given before this.
 *
 * A client's error is answered without a word in the terminal; a server's
 * is logged. A response already begun is cut off, as nothing can be added
 * to it. Mounted after everything else.
 *
 * @param err - What was thrown
 * @param req - The request
 * @param res - Its response
 * @param _next - Express's own last handler, which this one stands in for
 * @example
 * ```ts
 * app.use(finalErrors);
 * ```
 */
export function finalErrors(
  err: unknown,
  req: IncomingMessage,
  res: ServerResponse,
  _next: (err?: unknown) => void,
): void {
  const status = statusOf(err);
  if (status >= 500) log.error("A Studio request failed", err);
  if (res.headersSent) {
    res.destroy();
    return;
  }
  for (const name of FILE_HEADERS) res.removeHeader(name);
  const text = `${STATUS_CODES[status] ?? "Error"}\n`;
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(text),
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(req.method === "HEAD" ? undefined : text);
}

/* The status an HTTP error carries, a client's or a server's; anything else is the server's. */
function statusOf(err: unknown): number {
  if (typeof err !== "object" || err === null) return 500;
  for (const key of ["status", "statusCode"]) {
    const value: unknown = Reflect.get(err, key);
    if (typeof value === "number" && Number.isInteger(value) && value >= 400 && value < 600) {
      return value;
    }
  }
  return 500;
}
