const DANGEROUS_KEYS = ["__proto__", "constructor", "prototype"] as const;

/**
 * Whether a wire payload holds, at any depth, an own key that collides with
 * an `Object.prototype` slot — `__proto__`, `constructor` or `prototype`.
 *
 * Socket.IO parses JSON, which turns `"__proto__"` into an ordinary own key,
 * and a later `Object.assign` or merge of the value would reach the prototype
 * through it. Nested keys count: the value is walked whole, one level at a
 * time, so a payload deep enough to overflow a recursive walk is still read.
 *
 * @param value - A payload as the socket parsed it
 * @returns `true` when some object in it has one of the keys as its own
 * @example
 * ```ts
 * hasDangerousKeys(JSON.parse('{"a":[{"__proto__":{}}]}')); // → true
 * hasDangerousKeys({ a: [{ b: 1 }] }); // → false
 * ```
 */
export function hasDangerousKeys(value: unknown): boolean {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const next = pending.pop();
    if (typeof next !== "object" || next === null) continue;
    if (DANGEROUS_KEYS.some((key) => Object.hasOwn(next, key))) return true;
    const inner: unknown[] = Object.values(next);
    for (const value of inner) pending.push(value);
  }
  return false;
}
