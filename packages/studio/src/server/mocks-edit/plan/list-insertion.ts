import type { Comment, Span } from "oxc-parser";
import type { TextEdit } from "../types";
import { blockLines } from "./block-lines";
import { BYTE_ORDER_MARK } from "./byte-order-mark";
import type { ClosingRun } from "./closing-run";
import { closingRun } from "./closing-run";
import { insertion } from "./insertion";
import { lineStart } from "./line-start";
import type { CommentEnds } from "./skip-trivia";
import { trailingCommaAfter } from "./skip-trivia";
import type { FileStyle } from "./types";

/** A list between braces: an object literal's properties, or an import's names. */
export interface BracedList {
  /** The offset of `{`. */
  open: number;
  /** The offset of `}`. */
  close: number;
  items: readonly Span[];
}

/** The file a list is in, and how it is written. */
export interface ListSite {
  text: string;
  comments: readonly Comment[];
  commentEnds: CommentEnds;
  style: FileStyle;
  /** Whether all the file's code is on one line, which keeps an empty `{}` on it. */
  singleLineFile: boolean;
}

interface LineIndentation {
  indent: string;
  ownLine: boolean;
}

/**
 * Write the new entries for a layout: at `indent`, one per line when
 * `block`; single-line and without indentation otherwise.
 */
export type RenderEntries = (indent: string, block: boolean) => string[];

/**
 * Plan the insertions that append entries to a braced list, as pure
 * insertions that follow its layout.
 *
 * A list whose closing brace is on its own line is a block: each entry goes
 * on a line of its own at the start of the brace's line, indented like the
 * last item, and the last item gains a comma if it had none. Any other list
 * is inline: the entries follow the last item on its line. An empty `{}`
 * opens into a block, unless all of the file's code is on one line.
 *
 * @param list - The list and its braces
 * @param site - The file it is in
 * @param render - Writes the entries for the layout chosen
 * @returns The insertions, in ascending order
 *
 * @example
 * ```ts
 * planListInsertion({ open: 0, close: 7, items }, site, () => ["b: 2"]); // for "{ a: 1 }"
 * // → [{ start: 6, end: 6, text: ", b: 2" }]
 * ```
 */
export function planListInsertion(
  list: BracedList,
  site: ListSite,
  render: RenderEntries,
): TextEdit[] {
  const run = closingRun(site.text, list.close);
  const last = list.items[list.items.length - 1];
  if (last === undefined) return intoEmpty(list, site, run, render);
  const comma = trailingCommaAfter(site.text, last.end, site.commentEnds);
  if (run.block) return blockAfter(last, comma, site, run, render);
  const entries = render("", false).join(", ");
  if (comma === null) return [insertion(last.end, `, ${entries}`)];
  return [insertion(comma + 1, ` ${entries},`)];
}

function blockAfter(
  last: Span,
  comma: number | null,
  site: ListSite,
  run: ClosingRun,
  render: RenderEntries,
): TextEdit[] {
  const { text, style } = site;
  const item = lineIndentation(text, last.start);
  const indent = item.ownLine
    ? item.indent
    : lineIndentation(text, run.lineStart).indent + style.indent;
  const lastComma = comma !== null || style.trailingCommas;
  const lines = insertion(
    run.lineStart,
    blockLines(render(indent, true), indent, style.eol, lastComma),
  );
  return comma === null ? [insertion(last.end, ","), lines] : [lines];
}

function intoEmpty(
  list: BracedList,
  site: ListSite,
  run: ClosingRun,
  render: RenderEntries,
): TextEdit[] {
  const { text, style } = site;
  if (run.block) {
    const indent = lineIndentation(text, run.lineStart).indent + style.indent;
    const lines = blockLines(render(indent, true), indent, style.eol, style.trailingCommas);
    return [insertion(run.lineStart, lines)];
  }
  const inline = (): string => render("", false).join(", ");
  if (holdsComment(list, site.comments)) return [insertion(run.start, ` ${inline()}`)];
  if (!site.singleLineFile) return [openIntoBlock(list, site, render)];
  const padding = run.start === list.close ? " " : "";
  return [insertion(list.open + 1, ` ${inline()}${padding}`)];
}

/* The whitespace already inside `{ }` stays where it is: an insertion cannot
   remove it, and after the brace it is only trailing space. */
function openIntoBlock(list: BracedList, site: ListSite, render: RenderEntries): TextEdit {
  const { text, style } = site;
  const parent = lineIndentation(text, list.open).indent;
  const indent = parent + style.indent;
  const lines = blockLines(render(indent, true), indent, style.eol, style.trailingCommas);
  return insertion(list.close, `${style.eol}${lines}${parent}`);
}

/* The spaces and tabs that start the line holding `offset`, and whether only
   they precede it there. A BOM before the first line is not indentation, so
   it is stepped over rather than ending the run. */
function lineIndentation(text: string, offset: number): LineIndentation {
  const start = lineStart(text, offset);
  const from = start === 0 && text.startsWith(BYTE_ORDER_MARK) ? 1 : start;
  let end = from;
  while (text[end] === " " || text[end] === "\t") end += 1;
  return { indent: text.slice(from, end), ownLine: end >= offset };
}

function holdsComment(list: BracedList, comments: readonly Comment[]): boolean {
  return comments.some((comment) => comment.start > list.open && comment.end <= list.close);
}
