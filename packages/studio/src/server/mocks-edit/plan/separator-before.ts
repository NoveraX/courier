import { lineTerminatorLength } from "./line-terminator";

const BLANK = /^\s*$/;

/**
 * What to put between existing text and a block added after it, so a blank
 * line separates them — and nothing when there is nothing to separate from.
 * The line terminators already at the end count whatever their kind: LF,
 * CRLF, a lone CR, U+2028 or U+2029.
 *
 * @param before - Everything that precedes the added block
 * @param eol - The file's line ending
 * @returns Zero, one or two line breaks
 *
 * @example
 * ```ts
 * separatorBefore("const a = 1;\n", "\n"); // → "\n"
 * ```
 */
export function separatorBefore(before: string, eol: string): string {
  if (BLANK.test(before)) return "";
  const breaks = trailingBreaks(before);
  if (breaks >= 2) return "";
  return breaks === 1 ? eol : `${eol}${eol}`;
}

/* Counted from the end, and only as far as two: enough to tell whether a
   blank line is already there. */
function trailingBreaks(text: string): number {
  let breaks = 0;
  let at = text.length;
  while (breaks < 2) {
    const length = terminatorEndingAt(text, at);
    if (length === 0) break;
    breaks += 1;
    at -= length;
  }
  return breaks;
}

function terminatorEndingAt(text: string, end: number): number {
  if (lineTerminatorLength(text, end - 2) === 2) return 2;
  return lineTerminatorLength(text, end - 1) > 0 ? 1 : 0;
}
