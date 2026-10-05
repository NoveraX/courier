import type { DiffKind, DiffPair } from "./line-diff";

/** A line as one side of a diff shows it: its number on that side, and its text. */
export interface DiffLine {
  n: number;
  text: string;
}

/** A row of a side-by-side diff, numbered on each side; `null` where that side has no line. */
export interface DiffRow {
  kind: DiffKind;
  a: DiffLine | null;
  b: DiffLine | null;
}

/* The unchanged lines kept around each change when only the changes show. */
const CONTEXT = 2;

/**
 * How many rows of a diff differ.
 *
 * @param pairs - The diff
 * @returns The rows added, removed or changed
 * @example
 * ```ts
 * changeCount(lineDiff(a, b)); // 15
 * ```
 */
export function changeCount(pairs: readonly DiffPair[]): number {
  return pairs.filter((pair) => pair.kind !== "same").length;
}

/**
 * The rows of a side-by-side diff with each side's line numbers — all of
 * them, or only the changes with two unchanged lines either side.
 *
 * @param pairs - The diff
 * @param onlyChanges - Whether to leave out the unchanged lines away from any change
 * @returns The rows, top to bottom
 * @example
 * ```ts
 * diffRows(lineDiff(a, b), true)[0]; // { kind: "same", a: { n: 1, text: "{" }, b: { n: 1, text: "{" } }
 * ```
 */
export function diffRows(pairs: readonly DiffPair[], onlyChanges: boolean): DiffRow[] {
  let na = 0;
  let nb = 0;
  const rows: DiffRow[] = [];
  pairs.forEach((pair, i) => {
    const a = pair.a === null ? null : { n: ++na, text: pair.a };
    const b = pair.b === null ? null : { n: ++nb, text: pair.b };
    const near = pairs.slice(Math.max(0, i - CONTEXT), i + CONTEXT + 1);
    if (!onlyChanges || near.some((p) => p.kind !== "same")) rows.push({ kind: pair.kind, a, b });
  });
  return rows;
}
