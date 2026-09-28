/**
 * The proxy's own refusal, as the JSON a proxy client reads.
 *
 * @param status - The HTTP status
 * @param message - What the caller did wrong, and how to put it right
 * @param code - A stable name for the refusal, where a caller may act on it
 * @returns The refusal
 *
 * @example
 * ```ts
 * errorResponse(421, "Host not allowed", "HOST_NOT_ALLOWED");
 * ```
 */
export function errorResponse(status: number, message: string, code?: string): Response {
  const body = code === undefined ? { success: false, message } : { success: false, message, code };
  return Response.json(body, { status });
}
