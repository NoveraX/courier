/**
 * Whether a value is an object read by its keys: not null, not an array.
 *
 * @param value - The value to check
 * @returns Whether it can be read as a record of fields
 *
 * @example
 * ```ts
 * isRecord({ sources: {} }); // true
 * isRecord(["shop"]); // false
 * ```
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
