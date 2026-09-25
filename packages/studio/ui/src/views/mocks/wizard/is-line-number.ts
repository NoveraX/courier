/**
 * Whether a value is a line number as Studio counts them: a whole number
 * from 1.
 *
 * @param value - A field of an answer as JSON decoded it
 * @returns Whether it numbers a line
 *
 * @example
 * ```ts
 * isLineNumber(3); // → true
 * isLineNumber(0); // → false
 * ```
 */
export function isLineNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}
