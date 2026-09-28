/**
 * Whether a value that arrived from a runtime or a page is a plain object:
 * not a list, and with no prototype but `Object`'s or none. One with a
 * tampered prototype chain is refused, so a hostile sender cannot smuggle a
 * `__proto__` or `constructor` mutation through a spread downstream.
 *
 * @param raw - The value, as it arrived
 * @returns Whether it is a plain object
 * @example
 * ```ts
 * isPlainObject({ type: "request:start" }); // true
 * isPlainObject(new Map()); // false
 * ```
 */
export function isPlainObject(raw: unknown): raw is Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return false;
  const proto: unknown = Object.getPrototypeOf(raw);
  return proto === Object.prototype || proto === null;
}
