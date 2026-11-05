/**
 * Unified error hierarchy for realtime transports (SSE + WS).
 * All errors carry a numeric `code` for programmatic discrimination.
 *
 * Code ranges:
 * - 4400–4499: client errors (validation, missing topic, bad payload)
 * - 4401: auth rejected / token expired
 * - 4403: authorization denied (subscribe or message)
 * - 4404: topic not found / not subscribed
 * - 4413: message too large
 * - 4422: validation failed
 * - 4429: rate limited
 * - 5000: server internal error
 */

import { ConnectionError, RealtimeError } from "./realtime-error";
import { RealtimeValidationError } from "./validation-error";

export { ConnectionError, RealtimeError, RealtimeValidationError };

/** Authentication/authorization error (token expired, forbidden) */
export class AuthError extends RealtimeError {
  constructor(message = "Authentication required") {
    super(4401, message);
    this.name = "AuthError";
  }
}

/** Authorization denied for subscribe or message */
export class ForbiddenError extends RealtimeError {
  constructor(message = "Forbidden") {
    super(4403, message);
    this.name = "ForbiddenError";
  }
}

/**
 * A live connection's step that ran out of time: its middleware, its auth
 * callback, a request awaiting its answer.
 *
 * Named apart from the `TimeoutError` on the package root, which a call's
 * request throws when its own time runs out, as `RealtimeValidationError`
 * is from the root's `ValidationError`: catching one never catches the other.
 */
export class RealtimeTimeoutError extends RealtimeError {
  constructor(message = "Request timeout") {
    super(4408, message);
    this.name = "RealtimeTimeoutError";
  }
}

/** Rate limit exceeded */
export class RateLimitError extends RealtimeError {
  constructor(message = "Rate limited") {
    super(4429, message);
    this.name = "RateLimitError";
  }
}

/** Type guard for RealtimeError */
export function isRealtimeError(error: unknown): error is RealtimeError {
  return error instanceof RealtimeError;
}

/**
 * Map a WS error code to the appropriate RealtimeError subclass.
 * Used by the client to discriminate server error messages.
 *
 * @param code - WS error code from server
 * @param message - Error message from server
 * @param issues - Schema issues, for a validation failure
 * @returns Typed RealtimeError subclass
 */
export function fromErrorCode(
  code: number,
  message: string,
  issues?: readonly unknown[],
): RealtimeError {
  switch (code) {
    case 4401:
      return new AuthError(message);
    case 4403:
      return new ForbiddenError(message);
    case 4408:
      return new RealtimeTimeoutError(message);
    case 4422:
      return new RealtimeValidationError(message, issues);
    case 4429:
      return new RateLimitError(message);
    default:
      if (code >= 1000 && code < 2000) return new ConnectionError(message, code);
      return new RealtimeError(code, message);
  }
}
