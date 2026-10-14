import type { ParsedSource } from "@noverax/courier-cli/devkit";
import type { Directive, ObjectExpression, Statement } from "oxc-parser";
import { DEFAULT_INDENT, detectIndent } from "./detect-indent";
import { detectTrailingCommas } from "./detect-trailing-commas";
import { LINE_TERMINATOR } from "./line-terminator";
import type { FileStyle } from "./types";

/** Biome's defaults, for a file that shows no style of its own. */
export const DEFAULT_STYLE: FileStyle = {
  eol: "\n",
  quote: '"',
  semicolons: true,
  indent: DEFAULT_INDENT,
  trailingCommas: true,
};

type TopLevel = Directive | Statement;

/* The line endings a file can be written in, a tie going to the earlier. */
const EOLS: readonly FileStyle["eol"][] = ["\n", "\r\n", "\r"];
const TERMINATORS = new RegExp(LINE_TERMINATOR.source, "g");

/**
 * Read how a file is written, so the text added to it reads like the rest:
 * its line endings — LF, CRLF or a lone CR, whichever ends most of its
 * lines; U+2028 and U+2029 end lines too, but no editor writes a file in
 * them, so they do not count — the quote its module specifiers use, whether
 * its statements end with semicolons, its unit of indentation, and whether
 * its multi-line literals end with a comma — or, when a multi-line mocks
 * object is given, whether that one does, since the new entries join it.
 *
 * @param parsed - The parsed file; one that did not parse cleanly still has a style
 * @param mocksObject - The object new entries join, if any
 * @returns The file's style, each part defaulting to Biome's
 *
 * @example
 * ```ts
 * detectStyle(parseSource("x.ts", "import a from 'a'\r\n")).quote; // → "'"
 * ```
 */
export function detectStyle(
  parsed: ParsedSource,
  mocksObject: ObjectExpression | null = null,
): FileStyle {
  return {
    eol: detectEol(parsed.text),
    quote: detectQuote(parsed.program.body),
    semicolons: detectSemicolons(parsed.text, parsed.program.body),
    indent: detectIndent(parsed.text),
    trailingCommas: detectTrailingCommas(parsed, mocksObject),
  };
}

function detectEol(text: string): FileStyle["eol"] {
  const counts = new Map<string, number>();
  for (const [terminator] of text.matchAll(TERMINATORS)) {
    counts.set(terminator, (counts.get(terminator) ?? 0) + 1);
  }
  let best: FileStyle["eol"] = "\n";
  for (const eol of EOLS) if ((counts.get(eol) ?? 0) > (counts.get(best) ?? 0)) best = eol;
  return best;
}

function detectQuote(body: readonly TopLevel[]): FileStyle["quote"] {
  let single = 0;
  let double = 0;
  for (const statement of body) {
    const raw = moduleSource(statement)?.raw ?? "";
    if (raw.startsWith("'")) single += 1;
    if (raw.startsWith('"')) double += 1;
  }
  return single > double ? "'" : '"';
}

function moduleSource(statement: TopLevel): { raw: string | null } | null {
  switch (statement.type) {
    case "ImportDeclaration":
    case "ExportAllDeclaration":
      return statement.source;
    case "ExportNamedDeclaration":
      return statement.source;
    default:
      return null;
  }
}

/* Imports speak for the file when it has any; otherwise the statements that
   end with a semicolon when a file uses them. */
function detectSemicolons(text: string, body: readonly TopLevel[]): boolean {
  const imports = body.filter((statement) => statement.type === "ImportDeclaration");
  const pool = imports.length > 0 ? imports : body.filter(takesSemicolon);
  const ending = pool.filter((statement) => text[statement.end - 1] === ";").length;
  return ending >= pool.length - ending;
}

function takesSemicolon(statement: TopLevel): boolean {
  switch (statement.type) {
    case "VariableDeclaration":
    case "ExpressionStatement":
    case "ExportAllDeclaration":
    case "TSExportAssignment":
    case "TSTypeAliasDeclaration":
      return true;
    case "ExportDefaultDeclaration":
      return !isBlockDeclaration(statement.declaration.type);
    case "ExportNamedDeclaration":
      return statement.declaration === null || !isBlockDeclaration(statement.declaration.type);
    default:
      return false;
  }
}

function isBlockDeclaration(type: string): boolean {
  return /^(?:Function|Class|TSInterface|TSEnum|TSModule|TSDeclareFunction)/.test(type);
}
