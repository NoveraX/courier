import type { ParsedSource } from "@noverax/courier-cli/devkit";
import type { Directive, ImportDeclaration, Statement } from "oxc-parser";
import type { TextEdit } from "../types";
import { countLineTerminators } from "./count-line-terminators";
import { insertion } from "./insertion";
import { lineTerminatorLength } from "./line-terminator-length";
import { separatorBefore } from "./separator-before";
import { siteAboveFirstStatement } from "./site-above-first-statement";
import type { FileStyle } from "./types";

/** New import declarations, and where they go. */
export interface ImportLines {
  edit: TextEdit;
  /** Each declaration exactly as inserted, terminator included. */
  statements: string[];
}

/**
 * Plan where new import declarations go. In a file with imports: on the
 * line after the last one, when only spaces and comments that end on its
 * line follow it there; otherwise — code, or a comment that runs past the
 * line, follows it — on new lines right after it. In a file without
 * imports: above its first statement and the comments attached to it,
 * followed by a blank line; or at its end when it has no statement.
 *
 * @param parsed - The parsed file
 * @param statements - The declarations, each ended as the file ends statements
 * @param style - The file's style
 * @returns The insertion and the statements it adds, or `null` when there are none
 *
 * @example
 * ```ts
 * planImportLines(parseSource("x.ts", `import x from "x"; x();\n`), [`import a from "a";`], style);
 * // inserts `\nimport a from "a";` right after `import x from "x";`
 * ```
 */
export function planImportLines(
  parsed: ParsedSource,
  statements: readonly string[],
  style: FileStyle,
): ImportLines | null {
  if (statements.length === 0) return null;
  const last = parsed.program.body.filter(isImport).at(-1);
  if (last !== undefined) return afterImport(parsed, last, statements, style);
  const site = siteAboveFirstStatement(parsed);
  if (site !== null) return placed(site, lines(statements, style) + style.eol, statements);
  const block = separatorBefore(parsed.text, style.eol) + lines(statements, style);
  return placed(parsed.text.length, block, statements);
}

function afterImport(
  parsed: ParsedSource,
  last: ImportDeclaration,
  statements: readonly string[],
  style: FileStyle,
): ImportLines {
  const { text } = parsed;
  const at = restOfLine(parsed, last.end);
  if (at === text.length) return placed(at, breakBefore(statements, style), statements);
  const terminator = lineTerminatorLength(text, at);
  if (terminator > 0) return placed(at + terminator, lines(statements, style), statements);
  /* What followed the import on its line comes right after the last new
     statement, on the same line, so each is ended with a semicolon: a line
     that goes on with code has no line break to end a statement at. */
  const ended = statements.map((s) => (s.endsWith(";") ? s : `${s};`));
  return placed(last.end, breakBefore(ended, style), ended);
}

/* Step over spaces, tabs and the comments that end on the line they start
   on: what stops the scan is a line terminator, the end of the text, code,
   or a comment that runs onto another line. */
function restOfLine(parsed: ParsedSource, from: number): number {
  const { text, commentEnds } = parsed;
  let at = from;
  while (at < text.length) {
    const end = commentEnds.get(at);
    if (end !== undefined && countLineTerminators(text, at, end) === 0) {
      at = end;
      continue;
    }
    if (text[at] !== " " && text[at] !== "\t") break;
    at += 1;
  }
  return at;
}

function placed(at: number, text: string, statements: readonly string[]): ImportLines {
  return { edit: insertion(at, text), statements: [...statements] };
}

function lines(statements: readonly string[], style: FileStyle): string {
  return statements.map((statement) => statement + style.eol).join("");
}

function breakBefore(statements: readonly string[], style: FileStyle): string {
  return statements.map((statement) => style.eol + statement).join("");
}

function isImport(statement: Directive | Statement): statement is ImportDeclaration {
  return statement.type === "ImportDeclaration";
}
