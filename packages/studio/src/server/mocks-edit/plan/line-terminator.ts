/* Every character ECMAScript ends a line with, CR's pairing with LF aside. */
const TERMINATORS: ReadonlySet<string> = new Set(["\n", "\r", "\u2028", "\u2029"]);

/**
 * One line terminator, as the characters in {@link lineTerminatorLength}
 * read it: CRLF as one, then LF, a lone CR, U+2028 or U+2029. For splitting
 * a text into lines, or matching its terminators with a copy made global.
 *
 * @example
 * ```ts
 * "a\r\nb\rc\u2028d".split(LINE_TERMINATOR); // → ["a", "b", "c", "d"]
 * ```
 */
export const LINE_TERMINATOR = /\r\n|[\n\r\u2028\u2029]/;

/**
 * The length of the line terminator at `at`: 2 for CRLF; 1 for LF, a lone
 * CR, U+2028 or U+2029; 0 when there is none. A line of source may end with
 * any of them, so text inserted "on the next line" must look for all.
 *
 * @param text - The source text
 * @param at - A UTF-16 offset into it
 * @returns How many code units the terminator there takes; 0 outside the text
 *
 * @example
 * ```ts
 * lineTerminatorLength("a\r\nb", 1); // → 2
 * lineTerminatorLength("a\rb", 1);   // → 1
 * ```
 */
export function lineTerminatorLength(text: string, at: number): number {
  if (at < 0) return 0;
  if (text.startsWith("\r\n", at)) return 2;
  return TERMINATORS.has(text.charAt(at)) ? 1 : 0;
}

/**
 * How many lines end between two offsets, a CRLF counting once.
 *
 * @param text - The source text
 * @param start - Where to start counting
 * @param end - Where to stop, exclusive
 * @returns The number of line terminators in `text.slice(start, end)`
 *
 * @example
 * ```ts
 * countLineTerminators("a\r\n\nb", 0, 5); // → 2
 * ```
 */
export function countLineTerminators(text: string, start: number, end: number): number {
  let count = 0;
  let at = start;
  while (at < end) {
    const length = lineTerminatorLength(text, at);
    if (length > 0) count += 1;
    at += Math.max(length, 1);
  }
  return count;
}
