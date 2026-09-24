import { diffLines } from "./diff-lines";
import { findLineChanges } from "./line-changes";
import { shownText, type TextSpan } from "./shown-text";
import { type LinedText, type LineSpan, splitLines } from "./split-lines";
import type { InsertedLine, TextEdit } from "./types";

function linedText(text: string): LinedText {
  return { text, lines: splitLines(text) };
}

/** The text before insertions, recovered from the text after them. */
function withoutInsertions(newText: string, edits: readonly TextEdit[]): string {
  let oldText = "";
  let cursor = 0;
  let inserted = 0;
  for (const edit of edits) {
    const at = edit.start + inserted;
    oldText += newText.slice(cursor, at);
    cursor = at + edit.text.length;
    inserted += edit.text.length;
  }
  return oldText + newText.slice(cursor);
}

/** Where each insertion's text sits in the text after the insertions. */
function insertedSpans(edits: readonly TextEdit[]): TextSpan[] {
  const spans: TextSpan[] = [];
  let inserted = 0;
  for (const edit of edits) {
    const start = edit.start + inserted;
    inserted += edit.text.length;
    if (edit.text.length > 0) spans.push({ start, end: start + edit.text.length });
  }
  return spans;
}

/**
 * What the insertions put on one line: the whole line when every character
 * of it was inserted, otherwise only the inserted runs within it.
 */
function addedOn(text: string, line: LineSpan, inserted: readonly TextSpan[]): string {
  const runs: TextSpan[] = [];
  for (const span of inserted) {
    const start = Math.max(span.start, line.start);
    const end = Math.min(span.end, line.contentEnd);
    if (start < end) runs.push({ start, end });
  }
  const covered = runs.reduce((length, run) => length + run.end - run.start, 0);
  const whole = covered === line.contentEnd - line.start;
  return shownText(text, whole ? [{ start: line.start, end: line.contentEnd }] : runs);
}

/**
 * Lists the lines of a written text that hold inserted text — the lines a
 * diff of the edit shows as added — so the user can find them by hand, and
 * says what was inserted on each: the whole line when the line is new, or
 * only the inserted text on a line that was there before, so that taking
 * the edit out by hand never removes the user's own code.
 *
 * @param newText - The text after the edit.
 * @param edits - The insertions that produced it, in text order, with offsets
 *   into the text before them.
 * @returns Each such line once, numbered from 1, in text order; its text, and
 *   what was added on it, as a diff shows them. Inserted runs of one line that
 *   are not next to each other are joined by ` … `.
 * @throws {MocksEditRefusal} `INTERNAL_PLAN_REJECTED` when an edit is not an
 *   insertion or the edits are out of order.
 * @example
 * insertedLines("a,\nb\n", [{ start: 1, end: 1, text: ",\nb" }]);
 * // [{ line: 1, text: "a,", added: "," }, { line: 2, text: "b", added: "b" }]
 */
export function insertedLines(newText: string, edits: readonly TextEdit[]): InsertedLine[] {
  const before = linedText(withoutInsertions(newText, edits));
  const after = linedText(newText);
  const changes = findLineChanges(before.lines, after.lines, edits);
  const inserted = insertedSpans(edits);
  const lines: InsertedLine[] = [];
  for (const { kind, newLine, text } of diffLines(before, after, changes)) {
    const span = newLine === null ? undefined : after.lines[newLine - 1];
    if (kind !== "add" || newLine === null || span === undefined) continue;
    lines.push({ line: newLine, text, added: addedOn(newText, span, inserted) });
  }
  return lines;
}
