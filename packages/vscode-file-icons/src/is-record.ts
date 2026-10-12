/**
 * Whether a value is a plain object.
 *
 * @param value - The value
 * @returns Whether it is one
 * @example
 * ```ts
 * isRecord({}); // true
 * ```
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
