import type { DiffHunk, DiffLine } from "./types";

/** Unchanged lines shown on each side of a change. */
const CONTEXT_LINES = 3;

/**
 * Cut a whole-text diff into hunks: each changed line with the context
 * around it, two changes sharing a hunk when their context would touch.
 *
 * @param lines - Every line of the diff, unchanged ones included, in text order
 * @returns The hunks, in text order
 * @example
 * ```ts
 * sliceHunks([{ kind: "context", text: "a", oldLine: 1, newLine: 1 }, { kind: "add", text: "b", oldLine: null, newLine: 2 }]);
 * ```
 */
export function sliceHunks(lines: readonly DiffLine[]): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let first = -1;
  let last = -1;
  for (const [index, line] of lines.entries()) {
    if (line.kind === "context") continue;
    if (first !== -1 && index - last - 1 > 2 * CONTEXT_LINES) {
      hunks.push({ lines: lines.slice(first, last + CONTEXT_LINES + 1) });
      first = -1;
    }
    if (first === -1) first = Math.max(0, index - CONTEXT_LINES);
    last = index;
  }
  if (first !== -1) hunks.push({ lines: lines.slice(first, last + CONTEXT_LINES + 1) });
  return hunks;
}
