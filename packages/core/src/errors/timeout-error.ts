import { CourierError } from "./courier-error";

/**
 * Which time ran out: one attempt's — the request's `timeout` — or the whole
 * call's, its retry policy's `deadline`, which counts every attempt and every
 * wait between them.
 */
export type TimeoutScope = "attempt" | "deadline";

/**
 * Thrown when a request's time ran out before its answer was whole: its
 * `timeout`, which each attempt has to itself, or its retry policy's
 * `deadline`, which they share. An attempt that ran out may have reached
 * the server, which may still be working on it.
 *
 * @example
 * ```ts
 * try {
 *   await api.reports.build();
 * } catch (error) {
 *   if (isTimeoutError(error) && error.scope === "attempt") notify(`No answer within ${error.timeout} ms`);
 * }
 * ```
 */
export class TimeoutError extends CourierError<"TIMEOUT"> {
  /** Which time ran out: one attempt's, or the call's deadline. */
  readonly scope: TimeoutScope;
  /** How long it was, in ms, where it is known. */
  readonly timeout: number | undefined;

  /**
   * @param options - Which time ran out, how long it was, and what the platform reported
   */
  constructor(options: { scope: TimeoutScope; timeout?: number | undefined; cause?: unknown }) {
    const { scope, timeout, cause } = options;
    const after = timeout === undefined ? "" : ` after ${timeout} ms`;
    super(scope === "deadline" ? `Call deadline exceeded${after}` : `Request timed out${after}`, {
      code: "TIMEOUT",
      cause,
    });
    this.name = "TimeoutError";
    this.scope = scope;
    this.timeout = timeout;
  }
}

/** Type guard for `TimeoutError`. */
export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}
