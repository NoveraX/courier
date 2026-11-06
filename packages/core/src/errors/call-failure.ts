import { ValidationError } from "../validation";
import { isCourierError } from "./courier-error";
import type { MissingTokenError } from "./missing-token-error";
import { isRequestFailure, type RequestFailure } from "./request-failure";

/**
 * A call that ended without its endpoint's answer, for a reason its caller
 * expects and handles: its upstream refused it, no answer came or its time
 * ran out (a `RequestFailure`), its variables or its answer failed their
 * schema (`ValidationError`), or it needed a token there was none of
 * (`MissingTokenError`). A cancellation is none — its caller stopped waiting
 * — and neither is a mistake in how the API is described or the call made.
 */
export type CallFailure = RequestFailure | ValidationError | MissingTokenError;

/**
 * Type guard for {@link CallFailure}.
 *
 * @param error - What a call rejected with
 * @returns Whether the call failed for a reason its caller handles
 * @example
 * ```ts
 * try {
 *   await api.users.get({ id });
 * } catch (error) {
 *   if (isCallFailure(error)) return report(error.code);
 *   throw error;
 * }
 * ```
 */
export function isCallFailure(error: unknown): error is CallFailure {
  /* A missing token is read by its code, as the proxy reads it: a page that sends no token
     carries none of authMiddleware's code. */
  return (
    isRequestFailure(error) ||
    error instanceof ValidationError ||
    (isCourierError(error) && error.code === "TOKEN_MISSING")
  );
}
