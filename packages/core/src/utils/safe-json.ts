/**
 * JSON parsing for documents that arrive from the network.
 */

/**
 * Drop the keys that let a crafted document reach `Object.prototype`.
 *
 * @param key - Property being revived
 * @param value - Its decoded value
 * @returns The value, or `undefined` to drop a prototype-reaching key
 *
 * @example
 * ```ts
 * JSON.parse('{"__proto__":{"admin":true}}', reviveWithoutPrototypeKeys); // → {}
 * ```
 */
export function reviveWithoutPrototypeKeys(key: string, value: unknown): unknown {
  if (key === "__proto__" || key === "constructor" || key === "prototype") return undefined;
  return value;
}
