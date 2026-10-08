/**
 * Whether a value is a plain object: not `null`, not an array.
 *
 * @param value - Anything
 * @returns Whether it is a record
 * @example
 * ```ts
 * isRecord({}); // true
 * ```
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
