/**
 * Whether a value is a record its fields make up: an object of Object's own,
 * or one with no prototype — not a list, nor an instance of a class, which is
 * a value of its own.
 *
 * @param value - The value to check
 * @returns Whether its fields are all it is
 *
 * @example
 * ```ts
 * isPlainRecord({ role: "admin" }); // true
 * isPlainRecord(new URL("https://a.test")); // false
 * ```
 */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
