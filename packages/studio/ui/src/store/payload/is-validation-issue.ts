import { isPlainObject } from "@/socket/is-plain-object";
import type { ValidationIssue } from "../types";

/**
 * Whether a socket event's item is a validation issue: a path and a message,
 * with what was expected and received when the validator said.
 *
 * @param value - The item as the socket parsed it
 * @returns Whether it is one
 * @example
 * ```ts
 * isValidationIssue({ path: "id", message: "Expected number" }); // → true
 * ```
 */
export function isValidationIssue(value: unknown): value is ValidationIssue {
  if (!isPlainObject(value)) return false;
  const { path, message, expected, received } = value;
  return (
    typeof path === "string" &&
    typeof message === "string" &&
    (expected === undefined || typeof expected === "string") &&
    (received === undefined || typeof received === "string")
  );
}
