/** How a line differs between the two sides. */
export type DiffKind = "same" | "added" | "removed" | "changed";

/** One row of a side-by-side diff: the line on each side, `null` where that side has none. */
export interface DiffPair {
  kind: DiffKind;
  a: string | null;
  b: string | null;
}

/* Past this many cells the longest-common-run table costs more than a screen is worth; lines pair up by position. */
const MAX_CELLS = 4_000_000;

function lcsTable(a: readonly string[], b: readonly string[]): Uint32Array {
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j]
          ? (table[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0);
    }
  }
  return table;
}

function walk(a: readonly string[], b: readonly string[]): DiffPair[] {
  const table = lcsTable(a, b);
  const width = b.length + 1;
  const out: DiffPair[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const left = a[i];
    const right = b[j];
    if (left !== undefined && right !== undefined && left === right) {
      out.push({ kind: "same", a: left, b: right });
      i++;
      j++;
    } else if (
      right !== undefined &&
      (left === undefined || (table[i * width + j + 1] ?? 0) >= (table[(i + 1) * width + j] ?? 0))
    ) {
      out.push({ kind: "added", a: null, b: right });
      j++;
    } else {
      out.push({ kind: "removed", a: left ?? "", b: null });
      i++;
    }
  }
  return out;
}

function byPosition(a: readonly string[], b: readonly string[]): DiffPair[] {
  return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => {
    const left = a[i] ?? null;
    const right = b[i] ?? null;
    if (left === null) return { kind: "added" as const, a: null, b: right };
    if (right === null) return { kind: "removed" as const, a: left, b: null };
    return { kind: left === right ? ("same" as const) : ("changed" as const), a: left, b: right };
  });
}

/* Within a run of differing lines, the lines taken out and put in pair up, in order, as lines changed. */
function pairUp(pairs: readonly DiffPair[]): DiffPair[] {
  const out: DiffPair[] = [];
  let removed: string[] = [];
  let added: string[] = [];
  const flush = (): void => {
    const paired = Math.min(removed.length, added.length);
    for (let i = 0; i < paired; i++)
      out.push({ kind: "changed", a: removed[i] ?? "", b: added[i] ?? "" });
    for (const a of removed.slice(paired)) out.push({ kind: "removed", a, b: null });
    for (const b of added.slice(paired)) out.push({ kind: "added", a: null, b });
    removed = [];
    added = [];
  };
  for (const pair of pairs) {
    if (pair.kind === "removed" && pair.a !== null) removed.push(pair.a);
    else if (pair.kind === "added" && pair.b !== null) added.push(pair.b);
    else {
      flush();
      out.push(pair);
    }
  }
  flush();
  return out;
}

/**
 * The lines two texts share and the ones that differ, as rows of a
 * side-by-side diff: the longest run of lines in common kept aligned, and
 * within each run of differing lines the ones taken out and put in paired
 * up, in order, as lines changed on one row. Texts too long for that pair
 * their lines up by position.
 *
 * @param a - The left text's lines
 * @param b - The right text's lines
 * @returns The rows, top to bottom
 * @example
 * ```ts
 * lineDiff(["{", '  "a": 1', "}"], ["{", '  "a": 2', "}"])[1]; // { kind: "changed", a: '  "a": 1', b: '  "a": 2' }
 * ```
 */
export function lineDiff(a: readonly string[], b: readonly string[]): DiffPair[] {
  if (a.length * b.length > MAX_CELLS) return byPosition(a, b);
  return pairUp(walk(a, b));
}
