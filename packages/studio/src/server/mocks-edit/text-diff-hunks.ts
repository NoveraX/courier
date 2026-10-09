import { shownText } from "./shown-text";
import { sliceHunks } from "./slice-hunks";
import { type LineSpan, splitLines } from "./split-lines";
import type { DiffHunk, DiffLine } from "./types";

/* A changed middle with more line pairs than this shows removed and added whole, not matched line by line. */
const MOST_PAIRS = 4_000_000;

interface Side {
  readonly text: string;
  readonly lines: readonly LineSpan[];
  readonly raw: readonly string[];
}

/**
 * The hunks of a line diff between two texts, whatever changed between
 * them — a replacement, a formatter's work — with three lines of context
 * around each change. The lines both texts share at their start and end
 * are matched first; the middle is matched by its longest common run of
 * lines. A line shows as `buildDiffHunks` shows one.
 *
 * @param oldText - The text before the change
 * @param newText - The text after it
 * @returns The hunks, in text order; lines numbered from 1 on each side
 * @example
 * ```ts
 * textDiffHunks("a\nb\nc\n", "a\nB\nc\n");
 * // one hunk: a, −b, +B, c
 * ```
 */
export function textDiffHunks(oldText: string, newText: string): DiffHunk[] {
  const a = sideOf(oldText);
  const b = sideOf(newText);
  let head = 0;
  while (head < a.raw.length && head < b.raw.length && a.raw[head] === b.raw[head]) head++;
  let tail = 0;
  while (
    tail < a.raw.length - head &&
    tail < b.raw.length - head &&
    a.raw[a.raw.length - 1 - tail] === b.raw[b.raw.length - 1 - tail]
  ) {
    tail++;
  }
  const lines: DiffLine[] = [];
  for (let index = 0; index < head; index++) lines.push(context(a, index, index));
  lines.push(...middle(a, b, head, a.raw.length - tail, b.raw.length - tail));
  for (let back = tail; back > 0; back--) {
    lines.push(context(a, a.raw.length - back, b.raw.length - back));
  }
  return sliceHunks(lines);
}

function sideOf(text: string): Side {
  const lines = splitLines(text);
  return { text, lines, raw: lines.map((line) => text.slice(line.start, line.contentEnd)) };
}

function shown(side: Side, index: number): string {
  const line = side.lines[index];
  return line === undefined
    ? ""
    : shownText(side.text, [{ start: line.start, end: line.contentEnd }]);
}

function context(a: Side, oldIndex: number, newIndex: number): DiffLine {
  return {
    kind: "context",
    text: shown(a, oldIndex),
    oldLine: oldIndex + 1,
    newLine: newIndex + 1,
  };
}

/* The lines between the shared start and end, matched by their longest common run. */
function middle(a: Side, b: Side, from: number, oldEnd: number, newEnd: number): DiffLine[] {
  const m = oldEnd - from;
  const n = newEnd - from;
  if (m * n > MOST_PAIRS) return wholly(a, b, from, oldEnd, newEnd);
  const width = n + 1;
  const runs = new Uint32Array((m + 1) * width);
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      runs[i * width + j] =
        a.raw[from + i] === b.raw[from + j]
          ? (runs[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(runs[(i + 1) * width + j] ?? 0, runs[i * width + j + 1] ?? 0);
    }
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && a.raw[from + i] === b.raw[from + j]) {
      lines.push(context(a, from + i, from + j));
      i++;
      j++;
    } else if (
      i < m &&
      (j === n || (runs[(i + 1) * width + j] ?? 0) >= (runs[i * width + j + 1] ?? 0))
    ) {
      /* A line removed shows before the one added in its place, as diffs read. */
      lines.push({
        kind: "remove",
        text: shown(a, from + i),
        oldLine: from + i + 1,
        newLine: null,
      });
      i++;
    } else {
      lines.push({ kind: "add", text: shown(b, from + j), oldLine: null, newLine: from + j + 1 });
      j++;
    }
  }
  return lines;
}

function wholly(a: Side, b: Side, from: number, oldEnd: number, newEnd: number): DiffLine[] {
  const lines: DiffLine[] = [];
  for (let index = from; index < oldEnd; index++) {
    lines.push({ kind: "remove", text: shown(a, index), oldLine: index + 1, newLine: null });
  }
  for (let index = from; index < newEnd; index++) {
    lines.push({ kind: "add", text: shown(b, index), oldLine: null, newLine: index + 1 });
  }
  return lines;
}
