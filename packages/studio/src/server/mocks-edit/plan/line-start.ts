import { lineTerminatorLength } from "./line-terminator";

/**
 * Where the line holding `offset` starts: right after the last line
 * terminator before it — LF, CRLF, a lone CR, U+2028 or U+2029 — or at the
 * start of the text.
 *
 * @param text - The source text
 * @param offset - A UTF-16 offset into it
 * @returns The offset its line starts at
 *
 * @example
 * ```ts
 * lineStart("a\rbc", 3); // → 2
 * ```
 */
export function lineStart(text: string, offset: number): number {
  for (let at = offset - 1; at >= 0; at -= 1) {
    if (lineTerminatorLength(text, at) > 0) return at + 1;
  }
  return 0;
}
