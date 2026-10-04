/**
 * What a value is, in the words an error names it with.
 *
 * @param value - Any value
 * @returns `"undefined"`, `"null"`, `"an array"`, `"a promise"`, `"an object"`, or `"a"` and its type
 * @example
 * ```ts
 * kindOfValue(Promise.resolve()); // "a promise"
 * kindOfValue(5); // "a number"
 * ```
 */
export function kindOfValue(value: unknown): string {
  if (value === undefined || value === null) return String(value);
  if (Array.isArray(value)) return "an array";
  if (typeof value !== "object") return `a ${typeof value}`;
  return "then" in value && typeof value.then === "function" ? "a promise" : "an object";
}
