import { answerInit } from "../utils/answer-init";

/** What the proxy's own refusal says, as its JSON holds it. */
export interface ErrorFields {
  readonly success: false;
  readonly message: string;
  readonly code?: string;
}

/**
 * The fields of the proxy's own refusal: what `errorResponse` answers as
 * JSON, for a server that writes its answer itself.
 *
 * @param message - What the caller did wrong, and how to put it right
 * @param code - A stable name for the refusal, where a caller may act on it
 * @returns The fields, `code` among them only when given
 *
 * @example
 * ```ts
 * res.end(JSON.stringify(errorFields("No such connection: open another", "CONNECTION_GONE")));
 * ```
 */
export function errorFields(message: string, code?: string): ErrorFields {
  return code === undefined ? { success: false, message } : { success: false, message, code };
}

/**
 * The proxy's own refusal, as the JSON a proxy client reads.
 *
 * @param status - The HTTP status
 * @param message - What the caller did wrong, and how to put it right
 * @param code - A stable name for the refusal, where a caller may act on it
 * @param retryAfter - Seconds to wait before trying again, sent as `Retry-After`, for a refusal that passes
 * @returns The refusal
 *
 * @example
 * ```ts
 * errorResponse(421, "Host not allowed", "HOST_NOT_ALLOWED");
 * ```
 */
export function errorResponse(
  status: number,
  message: string,
  code?: string,
  retryAfter?: number,
): Response {
  return Response.json(
    errorFields(message, code),
    answerInit(status, retryAfter === undefined ? {} : { "retry-after": String(retryAfter) }),
  );
}
