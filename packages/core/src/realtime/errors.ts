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

import { NexusError } from "../errors";

/** Base error for all realtime transport errors */
export class RealtimeError extends NexusError<number> {
  constructor(code: number, message: string) {
    super(message, { code });
  }
}

/** Connection-level error (upgrade failed, network loss) */
export class ConnectionError extends RealtimeError {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(statusCode ?? 1006, message);
    this.name = "ConnectionError";
  }
}

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

/** Request timeout (middleware, auth callback, request-response) */
export class TimeoutError extends RealtimeError {
  constructor(message = "Request timeout") {
    super(4408, message);
    this.name = "TimeoutError";
  }
}

/** Rate limit exceeded */
export class RateLimitError extends RealtimeError {
  constructor(message = "Rate limited") {
    super(4429, message);
    this.name = "RateLimitError";
  }
}

/** Payload validation failed */
export class ValidationError extends RealtimeError {
  constructor(message = "Validation failed") {
    super(4422, message);
    this.name = "ValidationError";
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
 * @returns Typed RealtimeError subclass
 */
export function fromErrorCode(code: number, message: string): RealtimeError {
  switch (code) {
    case 4401:
      return new AuthError(message);
    case 4403:
      return new ForbiddenError(message);
    case 4408:
      return new TimeoutError(message);
    case 4422:
      return new ValidationError(message);
    case 4429:
      return new RateLimitError(message);
    default:
      if (code >= 1000 && code < 2000) return new ConnectionError(message, code);
      return new RealtimeError(code, message);
  }
}
