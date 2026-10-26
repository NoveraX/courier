/* A cut through a character written as two code units would leave half of it. */
const HALF_A_CHARACTER = /[\uD800-\uDBFF]$/;

/**
 * The start of a text, at most `length` code units long, without the
 * first half of a character UTF-16 writes as two when the cut falls
 * between them: a lone half no page can show, and that JSON escapes.
 *
 * @param text - The text
 * @param length - The most code units kept
 * @returns The start of the text, whole characters only
 * @example
 * ```ts
 * sliceWhole("ab" + String.fromCodePoint(0x1f600), 3); // → "ab"
 * ```
 */
export function sliceWhole(text: string, length: number): string {
  return text.slice(0, length).replace(HALF_A_CHARACTER, "");
}
