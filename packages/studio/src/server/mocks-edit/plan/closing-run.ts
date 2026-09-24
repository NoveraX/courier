import { lineTerminatorLength } from "./line-terminator";
import { WHITESPACE } from "./whitespace";

/** The whitespace right before a closing brace, which decides how a list is laid out. */
export interface ClosingRun {
  /** Where the whitespace starts; the brace's own offset when there is none. */
  start: number;
  /** Whether it holds a line terminator, which puts the brace on a line of its own. */
  block: boolean;
  /** Where the brace's line starts, when `block`; otherwise the brace's offset. */
  lineStart: number;
}

/**
 * Read the whitespace before a closing brace. Any line terminator in it —
 * LF, CRLF, a lone CR, U+2028 or U+2029 — ends the line before the brace.
 *
 * @param text - The source text
 * @param close - The offset of the `}`
 * @returns Where the run starts, and whether the brace sits on its own line
 *
 * @example
 * ```ts
 * closingRun("{\n  a,\n}", 7); // → { start: 6, block: true, lineStart: 7 }
 * ```
 */
export function closingRun(text: string, close: number): ClosingRun {
  let start = close;
  let lineStart: number | null = null;
  while (start > 0 && WHITESPACE.test(text.charAt(start - 1))) {
    start -= 1;
    if (lineStart === null && lineTerminatorLength(text, start) > 0) lineStart = start + 1;
  }
  return { start, block: lineStart !== null, lineStart: lineStart ?? close };
}
