/**
 * Reading a source's definition, which reaches the transports untyped: a
 * field that is not there, or not what it should be, reads as absent.
 */

/**
 * One field of a definition object.
 *
 * @param value - The object, or anything else
 * @param key - The field
 * @returns Its value, or `undefined` when the object has no such field of its own
 * @example
 * ```ts
 * fieldOf(api, "options"); // the source's options
 * ```
 */
export function fieldOf(value: unknown, key: string): unknown {
  if ((typeof value !== "object" && typeof value !== "function") || value === null)
    return undefined;
  return Object.hasOwn(value, key) ? Reflect.get(value, key) : undefined;
}

/**
 * A text field of a definition object.
 *
 * @param value - The object, or anything else
 * @param key - The field
 * @returns Its text, or `""` when it is absent or not text
 * @example
 * ```ts
 * textOf(options, "baseURL"); // "https://api.example.com"
 * ```
 */
export function textOf(value: unknown, key: string): string {
  const text = fieldOf(value, key);
  return typeof text === "string" ? text : "";
}
