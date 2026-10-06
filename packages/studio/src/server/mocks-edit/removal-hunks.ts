import { buildDiffHunks } from "./diff-hunks";
import type { DiffHunk, DiffLine, TextEdit } from "./types";

/* Removing text from the old one is inserting it into the new one, seen backwards. */
function asInsertions(oldText: string, removals: readonly TextEdit[]): TextEdit[] {
  let removed = 0;
  return removals.map((removal) => {
    const at = removal.start - removed;
    removed += removal.end - removal.start;
    return { start: at, end: at, text: oldText.slice(removal.start, removal.end) };
  });
}

function reversed(line: DiffLine): DiffLine {
  const kind = line.kind === "add" ? "remove" : line.kind === "remove" ? "add" : "context";
  return { kind, text: line.text, oldLine: line.newLine, newLine: line.oldLine };
}

/* Within each run of changed lines, the lines as they were come first. */
function removedFirst(lines: readonly DiffLine[]): DiffLine[] {
  const ordered: DiffLine[] = [];
  let run: DiffLine[] = [];
  const flush = () => {
    ordered.push(...run.filter((l) => l.kind === "remove"), ...run.filter((l) => l.kind === "add"));
    run = [];
  };
  for (const line of lines) {
    if (line.kind === "context") {
      flush();
      ordered.push(line);
    } else run.push(line);
  }
  flush();
  return ordered;
}

/**
 * Renders removals from a text as the hunks of a line diff: a line the
 * removals take whole shows as removed, and one they change inside — a
 * comma taken off, a name taken from between import braces — as removed and
 * then added as it now reads. Context and numbering are those of
 * {@link buildDiffHunks}.
 *
 * @param oldText - The text before the removals
 * @param newText - The text after them
 * @param removals - Removals from `oldText`, in text order, that turn it into `newText`
 * @returns The hunks, in text order; lines numbered from 1 on each side
 * @example
 * ```ts
 * buildRemovalHunks("a\nb\nc\n", "a\nc\n", [{ start: 2, end: 4, text: "" }]);
 * // [{ lines: [
 * //   { kind: "context", text: "a", oldLine: 1, newLine: 1 },
 * //   { kind: "remove", text: "b", oldLine: 2, newLine: null },
 * //   { kind: "context", text: "c", oldLine: 3, newLine: 2 },
 * // ] }]
 * ```
 */
export function buildRemovalHunks(
  oldText: string,
  newText: string,
  removals: readonly TextEdit[],
): DiffHunk[] {
  const inserted = buildDiffHunks(newText, oldText, asInsertions(oldText, removals));
  return inserted.map((hunk) => ({ lines: removedFirst(hunk.lines.map(reversed)) }));
}
