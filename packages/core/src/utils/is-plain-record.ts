/**
 * Whether a value is a record its fields make up: an object with no
 * prototype, or whose prototype is the root of its chain — `Object.prototype`
 * of whichever realm made it — not a list, nor an instance of a class, which
 * is a value of its own. Where a test runs in a context of its own, as Jest
 * runs each file, a record Node's `Response.json()` or `structuredClone`
 * made is of Node's realm, whose `Object.prototype` is not the context's.
 *
 * @param value - The value to check
 * @returns Whether its fields are all it is
 *
 * @example
 * ```ts
 * isPlainRecord({ role: "admin" }); // true
 * isPlainRecord(runInNewContext("({ role: 'admin' })")); // true
 * isPlainRecord(new URL("https://a.test")); // false
 * ```
 */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}
