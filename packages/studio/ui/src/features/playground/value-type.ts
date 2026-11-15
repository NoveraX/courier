/** What a JSON value is, as a schema's type names it. */
export type ValueType = "string" | "number" | "boolean" | "null" | "array" | "object";

/**
 * Whether a value is an object with keys: neither `null` nor an array.
 *
 * @param value - The value
 * @returns Whether it is one
 * @example
 * ```ts
 * isObjectValue({ id: "a" }); // true
 * isObjectValue([]); // false
 * ```
 */
export function isObjectValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * What a value parsed from JSON, or a default an endpoint fills in, is.
 *
 * @param value - The value
 * @returns Its type, as a schema names it
 * @example
 * ```ts
 * valueTypeOf([1, 2]); // "array"
 * ```
 */
export function valueTypeOf(value: unknown): ValueType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  return typeof value === "boolean" ? "boolean" : "object";
}
