import type { Comment, Directive, Statement } from "oxc-parser";
import { BYTE_ORDER_MARK } from "./byte-order-mark";
import { isFilePragma } from "./is-file-pragma";
import { countLineTerminators, lineTerminatorLength } from "./line-terminator";
import type { ParsedSource } from "./parse-source";

/**
 * Where lines added above a file's first statement go: above the run of
 * comments attached to it — each alone on its line, with no blank line
 * between it and what follows — so a comment that governs the statement,
 * such as `// @ts-expect-error` or `// biome-ignore`, stays on the line
 * above it. Never above a hashbang, the directive prologue, a comment a
 * blank line sets apart, such as a file header, or a triple-slash
 * directive or file-wide pragma such as `// @ts-nocheck`: TypeScript
 * honours those only above the first statement, so what is added goes
 * below the last of them.
 *
 * @param parsed - The parsed file
 * @returns The start of the line the run begins on — or the statement's own
 *   offset, when code precedes it on its line — or `null` when the file has
 *   no statement besides directives
 *
 * @example
 * ```ts
 * siteAboveFirstStatement(parseSource("x.ts", "// header\n\n// @ts-expect-error\nfoo();\n")); // → 11
 * siteAboveFirstStatement(parseSource("x.ts", "// @ts-nocheck\nfoo();\n")); // → 15
 * ```
 */
export function siteAboveFirstStatement(parsed: ParsedSource): number | null {
  const first = parsed.program.body.find((statement) => !isDirective(statement));
  if (first === undefined) return null;
  const floor = Math.max(prologueEnd(parsed), lastPragmaEnd(parsed.comments, first.start));
  let anchor = first.start;
  for (const comment of [...parsed.comments].reverse()) {
    if (comment.end > anchor) continue;
    if (comment.start < floor || !isAttached(parsed.text, comment, anchor, floor)) break;
    anchor = comment.start;
  }
  return ownLineStart(parsed.text, anchor, floor) ?? anchor;
}

/* A comment belongs to what follows it when no blank line separates them
   and it does not trail other code on its line. */
function isAttached(text: string, comment: Comment, next: number, floor: number): boolean {
  if (countLineTerminators(text, comment.end, next) > 1) return false;
  return ownLineStart(text, comment.start, floor) !== null;
}

/* Where the line holding `offset` starts, when only spaces and tabs precede
   `offset` on it; `null` when code, a directive or a hashbang does. */
function ownLineStart(text: string, offset: number, floor: number): number | null {
  let at = offset;
  while (at > floor && (text[at - 1] === " " || text[at - 1] === "\t")) at -= 1;
  const fileStart = at === 0 || (at === 1 && text.startsWith(BYTE_ORDER_MARK));
  return fileStart || lineTerminatorLength(text, at - 1) > 0 ? at : null;
}

/* Nothing may go above the end of the BOM, the hashbang, or the last directive. */
function prologueEnd(parsed: ParsedSource): number {
  const { text, program } = parsed;
  const bom = text.startsWith(BYTE_ORDER_MARK) ? 1 : 0;
  const directives = program.body.filter(isDirective);
  return Math.max(bom, program.hashbang?.end ?? 0, directives.at(-1)?.end ?? 0);
}

/* The end of the last pragma before the first statement; 0 when there is none. */
function lastPragmaEnd(comments: readonly Comment[], first: number): number {
  const pragma = comments.findLast((comment) => comment.end <= first && isFilePragma(comment));
  return pragma?.end ?? 0;
}

function isDirective(statement: Directive | Statement): boolean {
  return "directive" in statement && typeof statement.directive === "string";
}
