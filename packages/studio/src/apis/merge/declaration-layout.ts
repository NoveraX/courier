import type { ImportDeclaration, Program } from "oxc-parser";

import { type ParsedSource, parseSource } from "../../server/mocks-edit/plan/parse-source";
import { findGroupDeclaration, type GroupDeclaration } from "../manage/group-declaration";
import { entryLines } from "./endpoint-lines";
import { lineFinder } from "./line-index";
import type { ExistingEndpointInfo } from "./types";

/**
 * A file declaring endpoints, cut into the parts a merge keeps, replaces or
 * writes again — each found by the file's syntax, so text in a comment or a
 * string is never taken for code, however it is laid out.
 */
export interface DeclarationLayout {
  parsed: ParsedSource;
  declaration: GroupDeclaration;
  /** The statements above the declaration, its imports among them. */
  above: Program["body"];
  /** The import statements above the declaration. */
  imports: ImportDeclaration[];
  /** The lines above the first import, as written: a directive, a licence. */
  head: string[];
  /** The non-blank lines from the first import to the declaration that hold no import. */
  preamble: string[];
  /** The declaration from the start of its first line to the `{` opening its endpoints. */
  header: string[];
  /** Each endpoint, with the doc comment right above it, as whole lines. */
  endpoints: ExistingEndpointInfo[];
  /** From the `}` closing the endpoints to the end of the declaration's last line. */
  footer: string[];
  /** The non-blank lines after the declaration. */
  trailing: string[];
}

/** A file, its lines, and the line each offset of it falls on. */
interface Lines {
  content: string;
  lines: string[];
  lineOf: (offset: number) => number;
}

/**
 * Read a file's layout: its imports, the code above its declaration, the
 * declaration around its endpoints, each endpoint, and the code below.
 *
 * Only a file whose parts each take whole lines of their own can be cut
 * into them and written back, so such a file alone has a layout: one that
 * parses, holds a top-level `defineGroup` or `defineApi` with `endpoints`,
 * puts no two top-level statements on one line, and gives every endpoint a
 * key and lines of its own. Anything else — a spread among the endpoints,
 * two endpoints on a line — would be lost or doubled by writing lines back.
 *
 * @param content - The file's text
 * @param name - The name the declaration is bound to, when the file may hold several
 * @returns The layout, or `null` for a file that cannot be cut into whole-line parts
 * @example
 * ```ts
 * readLayout(groupFile, "pets")?.endpoints.map((entry) => entry.name); // ["listPets", "createPet"]
 * ```
 */
export function readLayout(content: string, name?: string | null): DeclarationLayout | null {
  const parsed = parseSource("declaration.ts", content);
  const declaration = parsed.problem === null ? findGroupDeclaration(parsed.program, name) : null;
  if (declaration === null) return null;
  const text: Lines = { content, lines: content.split("\n"), lineOf: lineFinder(content) };
  const { body } = parsed.program;
  const shared = body.some(
    (statement, at) =>
      at > 0 && text.lineOf((body[at - 1]?.end ?? 0) - 1) >= text.lineOf(statement.start),
  );
  const endpoints = shared ? null : ownedEntries(parsed, declaration, text);
  if (endpoints === null) return null;
  const above = body.slice(0, body.indexOf(declaration.statement));
  const imports = above.filter((s): s is ImportDeclaration => s.type === "ImportDeclaration");
  const last = text.lineOf(declaration.statement.end - 1);
  return {
    parsed,
    declaration,
    above,
    imports,
    ...aboveDeclaration(text, imports, text.lineOf(declaration.statement.start)),
    ...aroundEndpoints(text, declaration),
    endpoints,
    trailing: text.lines.slice(last + 1).filter((line) => line.trim() !== ""),
  };
}

/* Each endpoint as whole lines, or `null` when one has no key or shares a
   line with what is around it. */
function ownedEntries(
  parsed: ParsedSource,
  declaration: GroupDeclaration,
  { lines, lineOf }: Lines,
): ExistingEndpointInfo[] | null {
  const { endpoints } = declaration;
  let previous = lineOf(endpoints.start);
  const entries: ExistingEndpointInfo[] = [];
  for (const entry of entryLines(parsed.text, parsed.comments, endpoints, lineOf)) {
    if (entry.name === null || entry.commentStart <= previous) return null;
    const comment = lines.slice(entry.commentStart, entry.start).join("\n");
    const code = lines.slice(entry.start, entry.end + 1).join("\n");
    entries.push({ name: entry.name, code, comment: comment === "" ? undefined : comment });
    previous = entry.end;
  }
  return entries.length === 0 || previous < lineOf(endpoints.end - 1) ? entries : null;
}

/* What sits above the declaration: the lines before the first import, and
   the rest that hold no import. */
function aboveDeclaration(
  { lines, lineOf }: Lines,
  imports: readonly ImportDeclaration[],
  top: number,
): { head: string[]; preamble: string[] } {
  const spans = imports.map((s) => [lineOf(s.start), lineOf(s.end - 1)] as const);
  const first = spans[0]?.[0] ?? 0;
  const kept = (line: string, at: number): boolean =>
    line.trim() !== "" && !spans.some(([from, to]) => at >= from && at <= to);
  return {
    head: lines.slice(0, first),
    preamble: lines.slice(first, top).filter((line, at) => kept(line, first + at)),
  };
}

/* The declaration's text from the start of its first line to its endpoints'
   `{`, and from their `}` to the end of its last line. */
function aroundEndpoints(
  { content }: Lines,
  { statement, endpoints }: GroupDeclaration,
): { header: string[]; footer: string[] } {
  const startOf = (offset: number): number => content.lastIndexOf("\n", offset - 1) + 1;
  const close = endpoints.end - 1;
  /* The `}` keeps its indent when nothing but whitespace is before it on its line. */
  const from = content.slice(startOf(close), close).trim() === "" ? startOf(close) : close;
  const lineEnd = content.indexOf("\n", statement.end - 1);
  return {
    header: content.slice(startOf(statement.start), endpoints.start + 1).split("\n"),
    footer: content.slice(from, lineEnd === -1 ? content.length : lineEnd).split("\n"),
  };
}
