import { lineTerminatorLength } from "./plan/line-terminator-length";

/** Where one line of a text sits, in UTF-16 offsets. */
export interface LineSpan {
  /** The line's first character. */
  start: number;
  /** Just past the line's text, before its line break. */
  contentEnd: number;
  /** Just past its line break; `contentEnd` for a last line without one. */
  end: number;
}

/** A text with its lines. */
export interface LinedText {
  text: string;
  lines: readonly LineSpan[];
}

/**
 * Splits a text into lines at every line terminator ECMAScript knows: CRLF,
 * LF, a lone CR, U+2028 and U+2029 — the lines the planner numbers.
 *
 * A text that ends with a line break has no empty line after it, and an
 * empty text has no lines.
 *
 * @param text - The text to split.
 * @returns Its lines, in order.
 * @example
 * splitLines("a\r\nb\rc"); // [{ start: 0, contentEnd: 1, end: 3 }, { start: 3, contentEnd: 4, end: 5 }, { start: 5, contentEnd: 6, end: 6 }]
 */
export function splitLines(text: string): LineSpan[] {
  const lines: LineSpan[] = [];
  let start = 0;
  for (let at = 0; at < text.length; at += 1) {
    const terminator = lineTerminatorLength(text, at);
    if (terminator === 0) continue;
    lines.push({ start, contentEnd: at, end: at + terminator });
    at += terminator - 1;
    start = at + 1;
  }
  if (start < text.length) lines.push({ start, contentEnd: text.length, end: text.length });
  return lines;
}
