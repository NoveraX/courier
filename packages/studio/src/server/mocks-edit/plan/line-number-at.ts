import { countLineTerminators, lineTerminatorLength } from "./line-terminator";

/**
 * The 1-based line number of `offset`, for messages that point at the file.
 * Lines end with LF, CRLF, a lone CR, U+2028 or U+2029, as ECMAScript ends
 * them, so the number is the one an editor shows for the same text.
 *
 * @param text - The source text
 * @param offset - A UTF-16 offset into it
 * @returns The line it falls on; an offset on a line break is on the line the break ends
 *
 * @example
 * ```ts
 * lineNumberAt("a\nb\r\nc\rd", 7); // → 4
 * ```
 */
export function lineNumberAt(text: string, offset: number): number {
  const insideCrlf = lineTerminatorLength(text, offset - 1) === 2;
  return countLineTerminators(text, 0, insideCrlf ? offset - 1 : offset) + 1;
}
