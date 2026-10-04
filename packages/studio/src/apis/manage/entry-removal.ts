import type { Comment, Span } from "oxc-parser";
import { lineStart } from "../../server/mocks-edit/plan/line-start";
import type { CommentEnds } from "../../server/mocks-edit/plan/skip-trivia";
import { trailingCommaAfter } from "../../server/mocks-edit/plan/trailing-comma-after";
import type { TextEdit } from "../../server/mocks-edit/types";

/** The text entries are removed from, and its comments. */
export interface EntrySite {
  text: string;
  comments: readonly Comment[];
  commentEnds: CommentEnds;
}

/* Where an entry starts once its doc comment, right above it with only space between, is counted in. */
function withDocComment(site: EntrySite, start: number, floor: number): number {
  const doc = site.comments
    .filter(
      (c) => c.end <= start && c.start >= floor && c.type === "Block" && c.value.startsWith("*"),
    )
    .at(-1);
  return doc !== undefined && site.text.slice(doc.end, start).trim() === "" ? doc.start : start;
}

/* Past the rest of a line, when nothing but space or a line comment is left on it. */
function pastLine(text: string, from: number): number | null {
  const eol = text.indexOf("\n", from);
  const rest = text.slice(from, eol === -1 ? text.length : eol);
  if (!/^\s*(?:\/\/.*)?$/.test(rest)) return null;
  return eol === -1 ? text.length : eol + 1;
}

function removal(
  site: EntrySite,
  items: readonly Span[],
  at: number,
  removed: ReadonlySet<number>,
  floor: number,
): TextEdit {
  const { text, commentEnds } = site;
  const item = items[at];
  if (item === undefined) throw new RangeError(`no entry at ${at}`);
  const start = withDocComment(site, item.start, floor);
  const comma = trailingCommaAfter(text, item.end, commentEnds);
  const end = comma === null ? item.end : comma + 1;
  const line = lineStart(text, start);
  const pastEnd = pastLine(text, end);
  /* An entry on lines of its own goes with them. */
  if (text.slice(line, start).trim() === "" && pastEnd !== null)
    return { start: line, end: pastEnd, text: "" };
  if (comma !== null)
    return { start, end: end + (/^ +/.exec(text.slice(end))?.[0].length ?? 0), text: "" };
  /* The last entry of an inline list takes the comma before it, unless that entry goes too. */
  const previous = items[at - 1];
  const before =
    previous !== undefined && !removed.has(at - 1)
      ? trailingCommaAfter(text, previous.end, commentEnds)
      : null;
  return { start: before ?? start, end: item.end, text: "" };
}

/**
 * Plan removing entries from a braced list — an object literal's
 * properties, or an import's names — leaving every other character as it
 * is: each entry goes with its doc comment and its comma, and with its
 * lines when it has lines of its own.
 *
 * @param site - The text and its comments
 * @param items - The list's entries, in order
 * @param open - The offset of the list's `{`
 * @param indices - The positions of the entries to remove
 * @returns The removals, in ascending order
 * @example
 * ```ts
 * applyEdits(text, planEntryRemoval(site, endpoints.properties, endpoints.start, new Set([1])));
 * ```
 */
export function planEntryRemoval(
  site: EntrySite,
  items: readonly Span[],
  open: number,
  indices: ReadonlySet<number>,
): TextEdit[] {
  const edits: TextEdit[] = [];
  for (const at of [...indices].sort((a, b) => a - b)) {
    const floor = at === 0 ? open + 1 : (items[at - 1]?.end ?? open + 1);
    edits.push(removal(site, items, at, indices, floor));
  }
  return edits;
}
