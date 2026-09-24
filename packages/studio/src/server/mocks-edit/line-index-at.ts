import type { LineSpan } from "./split-lines";

/**
 * Finds the line an offset falls on. An offset at a line's end belongs to the
 * next line; past the last line break it belongs to no line.
 *
 * @param lines - The text's lines, from {@link splitLines}.
 * @param offset - An offset into the text, from 0 to its length.
 * @returns The line's index, or `lines.length` when the offset is on no line.
 * @example
 * lineIndexAt(splitLines("a\nb"), 2); // 1
 * lineIndexAt(splitLines("a\n"), 2); // 1, one past the only line
 */
export function lineIndexAt(lines: readonly LineSpan[], offset: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const line = lines[middle];
    if (line !== undefined && line.start <= offset) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  const line = lines[found];
  if (line === undefined) return lines.length;
  return offset < line.end || line.end === line.contentEnd ? found : lines.length;
}
