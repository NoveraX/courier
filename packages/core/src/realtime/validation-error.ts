/**
 * A refused value's realtime error, apart from `./errors` as `./realtime-error`
 * is: a direct caller refuses a stream's path with it before its client loads,
 * and a page that never does so does not carry it.
 */

import { RealtimeError } from "./realtime-error";

/**
 * Payload validation failed on a live connection.
 *
 * Named apart from the `ValidationError` on the package root, which reports a
 * schema failure on an HTTP response and is a different class — catching one
 * would never catch the other, and a shared name made that look like a bug in
 * the caller's code rather than two distinct errors.
 */
export class RealtimeValidationError extends RealtimeError {
  /**
   * @param message - What failed
   * @param issues - The schema's issues, as an HTTP call's 422 lists them
   */
  constructor(
    message = "Validation failed",
    readonly issues: readonly unknown[] = [],
  ) {
    super(4422, message);
    this.name = "RealtimeValidationError";
  }
}
