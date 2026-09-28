/**
 * Whether a value is an object read by its keys: not null, not an array.
 *
 * @param value - The value to check
 * @returns Whether it can be read as a record of fields
 *
 * @example
 * ```ts
 * isRecord({ userId: "u1" }); // true
 * isRecord(["u1"]); // false
 * ```
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
