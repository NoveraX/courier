/**
 * Whether a payload from the Studio server is a plain object that is safe to
 * keep in the store: not an array or a class instance, and without an own
 * key that could tamper with a prototype when it is spread or merged later.
 *
 * @param raw - A value as Socket.IO delivered it
 * @returns Whether its fields can be read as a record
 *
 * @example
 * ```ts
 * isPlainObject({ state: "loaded" }); // → true
 * isPlainObject(JSON.parse('{"__proto__": {}}')); // → false
 * ```
 */
export function isPlainObject(raw: unknown): raw is Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return false;
  const proto = Object.getPrototypeOf(raw);
  if (proto !== Object.prototype && proto !== null) return false;
  for (const key of Object.keys(raw)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") return false;
  }
  return true;
}
