/**
 * Whether a value is an object whose properties can be read, for values
 * Courier loaded from the user's files and knows nothing about.
 *
 * @param value - Anything
 * @returns `true` for a non-null object
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
