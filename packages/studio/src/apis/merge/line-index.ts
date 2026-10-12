/**
 * The line an offset falls on, counted from 0 over the text's `\n`-separated
 * lines — the lines a merge cuts a file into and writes it back from.
 *
 * @param content - The text
 * @returns A lookup from a UTF-16 offset to its line; a `\n` is on the line it ends
 * @example
 * ```ts
 * const lineOf = lineFinder("a\nb\nc");
 * lineOf(2); // 1
 * ```
 */
export function lineFinder(content: string): (offset: number) => number {
  const breaks: number[] = [];
  for (let at = content.indexOf("\n"); at !== -1; at = content.indexOf("\n", at + 1)) {
    breaks.push(at);
  }
  return (offset) => {
    let low = 0;
    let high = breaks.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((breaks[middle] ?? Number.POSITIVE_INFINITY) < offset) low = middle + 1;
      else high = middle;
    }
    return low;
  };
}
