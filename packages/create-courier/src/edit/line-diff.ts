/** A line a change removes or adds. */
export interface ChangedLine {
  readonly sign: "-" | "+";
  /** Its number, from 1: in the file as it was for a line removed, as it is left for a line added. */
  readonly line: number;
  readonly text: string;
}

/* The longest common subsequence's lengths, for every pair of suffixes. */
function suffixTable(before: readonly string[], after: readonly string[]): Int32Array {
  const width = after.length + 1;
  const table = new Int32Array((before.length + 1) * width);
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      table[i * width + j] =
        before[i] === after[j]
          ? (table[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0);
    }
  }
  return table;
}

/**
 * The lines a change to a file removes and adds, in the file's order — a
 * line replaced reads as removed, then added — for the plan to show what
 * an edit does.
 *
 * @param before - The file as it is
 * @param after - The file as the edit leaves it
 * @returns The changed lines; none when the two are the same
 * @example
 * ```ts
 * changedLines("plugins: [react()]\n", "plugins: [react(), courierStudio()]\n");
 * // [{ sign: "-", line: 1, text: "plugins: [react()]" }, { sign: "+", line: 1, text: "plugins: [react(), courierStudio()]" }]
 * ```
 */
export function changedLines(before: string, after: string): ChangedLine[] {
  const from = before.split("\n");
  const to = after.split("\n");
  const table = suffixTable(from, to);
  const width = to.length + 1;
  const changed: ChangedLine[] = [];
  let i = 0;
  let j = 0;
  while (i < from.length || j < to.length) {
    if (i < from.length && j < to.length && from[i] === to[j]) {
      i++;
      j++;
    } else if (
      i < from.length &&
      (j === to.length || (table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0))
    ) {
      changed.push({ sign: "-", line: i + 1, text: from[i++] ?? "" });
    } else {
      changed.push({ sign: "+", line: j + 1, text: to[j++] ?? "" });
    }
  }
  return changed;
}
