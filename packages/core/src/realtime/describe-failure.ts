import { RealtimeError } from "./errors";

/** What a client is told about a stream or subscription that failed. */
export interface StreamFailure {
  code: number;
  message: string;
}

const INTERNAL_ERROR = 5000;

/**
 * Decide what a client may read about a handler's failure.
 *
 * A `RealtimeError` is the handler speaking to the client — "not a member of
 * this room" — so its code and message go out as they are. Anything else may
 * carry connection strings, paths or upstream text, so the client gets a
 * generic message and the server's log gets the error.
 *
 * @param error - What the handler threw
 * @param fallback - The message a client reads for any other error
 * @returns The code and message to put on the wire
 * @example
 * describeFailure(new ForbiddenError("Not a member"), "Stream failed");
 * // { code: 4403, message: "Not a member" }
 */
export function describeFailure(error: unknown, fallback: string): StreamFailure {
  if (error instanceof RealtimeError) return { code: error.code, message: error.message };
  return { code: INTERNAL_ERROR, message: fallback };
}
