import type { ServerResponse } from "node:http";

/**
 * Answer with an error in the shape every Courier adapter uses,
 * `{ success: false, message, code? }`, so a client reads a refusal from
 * the standalone server the way it reads one from any other.
 *
 * @param res - The response, not yet started
 * @param status - The HTTP status
 * @param message - What went wrong, for the caller
 * @param code - A stable name for the refusal, where a caller may act on it
 *
 * @example
 * ```ts
 * sendError(res, 403, "Origin not allowed", "ORIGIN_NOT_ALLOWED");
 * ```
 */
export function sendError(
  res: ServerResponse,
  status: number,
  message: string,
  code?: string,
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify(
      code === undefined ? { success: false, message } : { success: false, message, code },
    ),
  );
}
