/** Where a character is, as an editor counts: lines and columns from 1. */
export interface TextPosition {
  readonly line: number;
  readonly column: number;
}

/**
 * Turn offsets in a text into lines and columns, the line starts found once.
 *
 * @param text - The text
 * @returns What places an offset
 * @example
 * ```ts
 * positionsIn("a\nbc")(3); // { line: 2, column: 2 }
 * ```
 */
export function positionsIn(text: string): (offset: number) => TextPosition {
  const starts = [0];
  for (let at = text.indexOf("\n"); at !== -1; at = text.indexOf("\n", at + 1)) starts.push(at + 1);
  return (offset) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if ((starts[middle] ?? 0) <= offset) low = middle;
      else high = middle - 1;
    }
    return { line: low + 1, column: offset - (starts[low] ?? 0) + 1 };
  };
}
