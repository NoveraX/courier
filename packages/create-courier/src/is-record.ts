/**
 * Whether a value is a plain object: what JSON parses an object as.
 *
 * @param value - The value
 * @returns Whether it is an object, and not null or an array
 * @example
 * ```ts
 * isRecord(JSON.parse('{ "a": 1 }')); // true
 * ```
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
