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
