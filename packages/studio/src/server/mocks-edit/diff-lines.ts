import type { LineChange } from "./line-changes";
import { shownText } from "./shown-text";
import type { LinedText, LineSpan } from "./split-lines";
import type { DiffLine } from "./types";

function shownLine(text: string, line: LineSpan): string {
  return shownText(text, [{ start: line.start, end: line.contentEnd }]);
}

/** Unchanged old lines `from` to `to`, each `shift` lines further on in the new text. */
function contextLines(before: LinedText, from: number, to: number, shift: number): DiffLine[] {
  const lines: DiffLine[] = [];
  for (let index = from; index < to; index++) {
    const line = before.lines[index];
    if (line === undefined) break;
    const text = shownLine(before.text, line);
    lines.push({ kind: "context", text, oldLine: index + 1, newLine: index + shift + 1 });
  }
  return lines;
}

function changedLines(change: LineChange, before: LinedText, after: LinedText): DiffLine[] {
  const lines: DiffLine[] = [];
  const oldLine = before.lines[change.oldIndex];
  const oldNumber = change.oldIndex + 1;
  if (change.keptIndex === null && oldLine !== undefined) {
    const text = shownLine(before.text, oldLine);
    lines.push({ kind: "remove", text, oldLine: oldNumber, newLine: null });
  }
  for (let index = change.newFirst; index <= change.newLast; index++) {
    const line = after.lines[index];
    if (line === undefined) continue;
    const text = shownLine(after.text, line);
    lines.push(
      index === change.keptIndex
        ? { kind: "context", text, oldLine: oldNumber, newLine: index + 1 }
        : { kind: "add", text, oldLine: null, newLine: index + 1 },
    );
  }
  return lines;
}

/**
 * Lays out the whole text as a line diff: every unchanged line as context,
 * and for each change the old line removed, when it did not survive whole,
 * and the lines it became.
 *
 * @param before - The text before the edit.
 * @param after - The text after it.
 * @param changes - What the edit did to each old line it touched, in text order.
 * @returns Every line of both texts, in order, numbered from 1 on each side.
 * @example
 * const before = { text: "a\n", lines: splitLines("a\n") };
 * const after = { text: "a\nb\n", lines: splitLines("a\nb\n") };
 * diffLines(before, after, [{ oldIndex: 1, hasOldLine: false, newFirst: 1, newLast: 1, keptIndex: null }]);
 * // [
 * //   { kind: "context", text: "a", oldLine: 1, newLine: 1 },
 * //   { kind: "add", text: "b", oldLine: null, newLine: 2 },
 * // ]
 */
export function diffLines(
  before: LinedText,
  after: LinedText,
  changes: readonly LineChange[],
): DiffLine[] {
  const lines: DiffLine[] = [];
  let cursor = 0;
  let shift = 0;
  for (const change of changes) {
    lines.push(...contextLines(before, cursor, change.oldIndex, shift));
    lines.push(...changedLines(change, before, after));
    cursor = change.oldIndex + (change.hasOldLine ? 1 : 0);
    shift = change.newLast + 1 - cursor;
  }
  lines.push(...contextLines(before, cursor, before.lines.length, shift));
  return lines;
}
