import { CourierError } from "./courier-error";

/**
 * Whether an error is a `CourierError`, of any subclass. Apart from the
 * class, which an API's definition throws: a page of definitions alone
 * loads no guard a call's failure is told by.
 *
 * @param error - What was thrown
 * @returns Whether a Courier package threw it
 * @example
 * ```ts
 * if (isCourierError(error) && error.code === "CONFIG_NOT_FOUND") useDefaults();
 * ```
 */
export function isCourierError(error: unknown): error is CourierError {
  return error instanceof CourierError;
}
