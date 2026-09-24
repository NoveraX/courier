import { lineIndexAt } from "./line-index-at";
import { MocksEditRefusal } from "./mocks-edit-refusal";
import type { LineSpan } from "./split-lines";
import type { TextEdit } from "./types";

/** An insertion, placed in the old text and in the new one. */
interface PlacedInsertion {
  oldOffset: number;
  /** Where the inserted text starts in the new text. */
  newStart: number;
  /** Just past the inserted text in the new text. */
  newEnd: number;
}

/** The old line some insertions fell on, and the new lines it became. */
export interface LineChange {
  /** The old line's index; the old line count when the insertions follow the last line break. */
  oldIndex: number;
  /** Whether the insertions fell on an old line rather than after the last line break. */
  hasOldLine: boolean;
  /** The first new line the old line became. */
  newFirst: number;
  /** The last new line the old line became. */
  newLast: number;
  /** The new line that is the old line unchanged, or `null` when none is. */
  keptIndex: number | null;
}

function placeInsertions(edits: readonly TextEdit[]): PlacedInsertion[] {
  const placed: PlacedInsertion[] = [];
  let shift = 0;
  let previous = 0;
  for (const edit of edits) {
    if (edit.end !== edit.start || edit.start < previous) {
      throw new MocksEditRefusal(
        "INTERNAL_PLAN_REJECTED",
        "The planned edit is not a list of insertions in text order",
      );
    }
    previous = edit.start;
    if (edit.text.length === 0) continue;
    const newStart = edit.start + shift;
    shift += edit.text.length;
    placed.push({ oldOffset: edit.start, newStart, newEnd: newStart + edit.text.length });
  }
  return placed;
}

function groupByOldLine(
  insertions: readonly PlacedInsertion[],
  oldLines: readonly LineSpan[],
): Map<number, PlacedInsertion[]> {
  const groups = new Map<number, PlacedInsertion[]>();
  for (const insertion of insertions) {
    const index = lineIndexAt(oldLines, insertion.oldOffset);
    const group = groups.get(index);
    if (group === undefined) groups.set(index, [insertion]);
    else group.push(insertion);
  }
  return groups;
}

/**
 * Whether a new line holds exactly the old line's text and nothing inserted:
 * its text starts where the old line's did once the insertions before it are
 * taken out, is as long, and no insertion reaches into it.
 */
function isOldLineUnchanged(
  newLine: LineSpan,
  oldLine: LineSpan,
  group: readonly PlacedInsertion[],
): boolean {
  if (newLine.contentEnd - newLine.start !== oldLine.contentEnd - oldLine.start) return false;
  const [first] = group;
  if (first === undefined) return false;
  let insertedBefore = first.newStart - first.oldOffset;
  for (const insertion of group) {
    if (insertion.newStart < newLine.contentEnd && insertion.newEnd > newLine.start) return false;
    if (insertion.newEnd <= newLine.start) insertedBefore += insertion.newEnd - insertion.newStart;
  }
  return newLine.start - insertedBefore === oldLine.start;
}

function findKept(
  change: Omit<LineChange, "keptIndex">,
  oldLine: LineSpan | undefined,
  newLines: readonly LineSpan[],
  group: readonly PlacedInsertion[],
): number | null {
  if (oldLine === undefined) return null;
  for (let index = change.newFirst; index <= change.newLast; index++) {
    const newLine = newLines[index];
    if (newLine !== undefined && isOldLineUnchanged(newLine, oldLine, group)) return index;
  }
  return null;
}

/**
 * Works out, line by line, what insertions did to a text: each old line an
 * insertion fell on, the new lines it became, and which of those, if any, is
 * the old line unchanged — as when a whole line is inserted before or after it.
 *
 * @param oldLines - The lines of the text before the edit, from {@link splitLines}.
 * @param newLines - The lines of the text after it.
 * @param edits - Insertions into the old text, in text order.
 * @returns One change per old line the insertions fell on, in text order.
 * @throws {MocksEditRefusal} `INTERNAL_PLAN_REJECTED` when an edit is not an
 *   insertion or the edits are out of order.
 * @example
 * findLineChanges(splitLines("a\nb\n"), splitLines("a\nx\nb\n"), [{ start: 2, end: 2, text: "x\n" }]);
 * // [{ oldIndex: 1, hasOldLine: true, newFirst: 1, newLast: 2, keptIndex: 2 }]
 */
export function findLineChanges(
  oldLines: readonly LineSpan[],
  newLines: readonly LineSpan[],
  edits: readonly TextEdit[],
): LineChange[] {
  const changes: LineChange[] = [];
  for (const [oldIndex, group] of groupByOldLine(placeInsertions(edits), oldLines)) {
    const first = group[0];
    const last = group[group.length - 1];
    if (first === undefined || last === undefined) continue;
    const newFirst = lineIndexAt(newLines, first.newStart);
    const newLast = Math.min(lineIndexAt(newLines, last.newEnd), newLines.length - 1);
    const change = { oldIndex, hasOldLine: oldIndex < oldLines.length, newFirst, newLast };
    const keptIndex = findKept(change, oldLines[oldIndex], newLines, group);
    changes.push({ ...change, keptIndex });
  }
  return changes;
}
