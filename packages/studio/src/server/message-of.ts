import { inspect } from "node:util";
import { createLogger } from "@noverax/courier";

const log = createLogger("Studio");

/**
 * The message of what a load, a mocks file or any other project code threw,
 * as it was written: an `Error`'s message, or the thrown value as text.
 *
 * Project code may throw anything, including a value `String()` cannot
 * convert, such as an object with no prototype. That value is described by
 * its contents instead, so reporting a failure never fails in turn.
 *
 * @param error - What was thrown
 * @returns Its message; never throws
 *
 * @example
 * ```ts
 * messageOf(new Error("Cannot find module ./src/api")); // → "Cannot find module ./src/api"
 * messageOf(Object.create(null)); // → "[Object: null prototype] {}"
 * ```
 */
export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return String(error);
  } catch (unconvertible) {
    log.debug("A thrown value has no string form; describing it by its contents", unconvertible);
    return inspect(error, { breakLength: Number.POSITIVE_INFINITY });
  }
}
