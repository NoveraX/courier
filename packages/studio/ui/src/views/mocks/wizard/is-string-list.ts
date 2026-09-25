/**
 * Whether a value from Studio is an array of strings.
 *
 * @param value - A field of an answer as JSON decoded it
 * @returns Whether every element is a string
 *
 * @example
 * ```ts
 * isStringList(["Studio creates courier.mocks.ts."]); // → true
 * isStringList(["a", 1]); // → false
 * ```
 */
export function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
