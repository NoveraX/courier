import { lineTerminatorLength } from "./line-terminator-length";

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
