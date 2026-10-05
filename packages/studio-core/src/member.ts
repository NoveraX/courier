/**
 * A property of a value that may not be an object or a function, read
 * without trusting its shape: a schema's definition, a definition's field,
 * a client's method.
 *
 * @param value - The value
 * @param key - The property
 * @returns The property's value, or `undefined` when there is none
 * @example
 * ```ts
 * member(member(schema, "_zod"), "def"); // a Zod v4 schema's definition
 * ```
 */
export function member(value: unknown, key: string): unknown {
  /* No `key in value` check: a proxy client answers `get` for members its `has` does not list. */
  return (typeof value === "object" || typeof value === "function") && value !== null
    ? Reflect.get(value, key)
    : undefined;
}
