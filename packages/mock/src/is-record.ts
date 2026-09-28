/**
 * Whether a value is an object whose properties can be read: what a schema's
 * internals, a request's variables or a caller's value are, as far as the
 * mock can know.
 *
 * @param value - Anything
 * @returns `true` for a non-null object
 * @example
 * ```ts
 * isRecord({ id: 1 }); // → true
 * isRecord(null); // → false
 * ```
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
