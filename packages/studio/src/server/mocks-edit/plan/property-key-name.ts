import type { PropertyKey } from "oxc-parser";

/**
 * The key a non-computed property declares: an identifier's name, a string's
 * value, or a number's canonical string, as `Object.keys` reports it.
 *
 * @param key - A property's key
 * @returns The key, or `null` for a key that is not written literally
 *
 * @example
 * ```ts
 * // { "a-b": x, 1e3: y } → "a-b", "1000"
 * propertyKeyName(property.key);
 * ```
 */
export function propertyKeyName(key: PropertyKey): string | null {
  if (key.type === "Identifier") return key.name;
  if (key.type !== "Literal") return null;
  const { value } = key;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return null;
}
