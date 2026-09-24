import { diffLines } from "./diff-lines";
import { findLineChanges } from "./line-changes";
import { type LinedText, splitLines } from "./split-lines";
import type { DiffHunk, DiffLine, TextEdit } from "./types";

/** Unchanged lines shown on each side of a change. */
const CONTEXT_LINES = 3;

function linedText(text: string): LinedText {
  return { text, lines: splitLines(text) };
}

/**
 * Cuts a whole-text diff into hunks: each changed line with the context
 * around it, two changes sharing a hunk when their context would touch.
 */
function sliceHunks(lines: readonly DiffLine[]): DiffHunk[] {
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

/**
 * Renders insertions into a text as the hunks of a line diff.
 *
 * Each insertion is widened to whole lines. An old line the insertion leaves
 * whole — a line added before or after it — shows as context; one it changes
 * inside — a comma appended, a name added between import braces — shows as
 * removed and then added as it now reads. Three lines of context surround
 * each change, and changes whose context would touch share one hunk. A line
 * shows without a byte order mark or carriage returns, cut to 200 characters
 * ending in `…` when longer. To show a new file, pass `""` and a single
 * insertion of the whole file at 0.
 *
 * @param oldText - The text before the edit.
 * @param newText - The text after it.
 * @param edits - Insertions into `oldText`, in text order, that turn it into `newText`.
 * @returns The hunks, in text order; lines numbered from 1 on each side.
 * @throws {MocksEditRefusal} `INTERNAL_PLAN_REJECTED` when an edit is not an
 *   insertion or the edits are out of order.
 * @example
 * buildDiffHunks("a\nc\n", "a\nb\nc\n", [{ start: 2, end: 2, text: "b\n" }]);
 * // [{ lines: [
 * //   { kind: "context", text: "a", oldLine: 1, newLine: 1 },
 * //   { kind: "add", text: "b", oldLine: null, newLine: 2 },
 * //   { kind: "context", text: "c", oldLine: 2, newLine: 3 },
 * // ] }]
 */
export function buildDiffHunks(
  oldText: string,
  newText: string,
  edits: readonly TextEdit[],
): DiffHunk[] {
  const before = linedText(oldText);
  const after = linedText(newText);
  return sliceHunks(diffLines(before, after, findLineChanges(before.lines, after.lines, edits)));
}
