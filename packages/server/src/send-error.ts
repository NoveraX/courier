import type { ServerResponse } from "node:http";

/**
 * Answer with an error in the shape every Courier adapter uses,
 * `{ success: false, message }`, so a client reads a refusal from the
 * standalone server the way it reads one from any other.
 *
 * @param res - The response, not yet started
 * @param status - The HTTP status
 * @param message - What went wrong, for the caller
 *
 * @example
 * ```ts
 * sendError(res, 403, "Origin not allowed");
 * ```
 */
export function sendError(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: false, message }));
}
