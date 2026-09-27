import type { ImportDeclaration } from "oxc-parser";
import { applyEdits } from "../../server/mocks-edit/plan/apply-edits";
import { lineStart } from "../../server/mocks-edit/plan/line-start";
import { parseSource } from "../../server/mocks-edit/plan/parse-source";
import type { TextEdit } from "../../server/mocks-edit/types";
import { planEntryRemoval } from "./entry-removal";

/* The code with its imports and comments blanked out, offsets kept. */
function codeOnly(text: string, spans: ReadonlyArray<{ start: number; end: number }>): string {
  let code = text;
  for (const { start, end } of spans)
    code = code.slice(0, start) + " ".repeat(end - start) + code.slice(end);
  return code;
}

function uses(code: string, name: string): boolean {
  return new RegExp(`(?<![\\w$])${name.replaceAll("$", "\\$")}(?![\\w$])`).test(code);
}

function wholeStatement(text: string, statement: ImportDeclaration): TextEdit {
  const eol = text.indexOf("\n", statement.end);
  return {
    start: lineStart(text, statement.start),
    end: eol === -1 ? text.length : eol + 1,
    text: "",
  };
}

/**
 * Drop the imported names some removed code used and nothing left uses:
 * a name no other code in the file mentions goes from its import, and an
 * import left with no name goes whole. Names the removed code did not use
 * stay, used or not — they are the file's business.
 *
 * @param fileName - The file's name, for the parser
 * @param text - The file once the code was removed
 * @param candidates - The names the removed code used
 * @returns The file without the imports only that code needed
 * @example
 * ```ts
 * dropUnusedImports("index.ts", withoutDeletePet, new Set(["endpoint", "PetSchema"]));
 * ```
 */
export function dropUnusedImports(
  fileName: string,
  text: string,
  candidates: ReadonlySet<string>,
): string {
  if (candidates.size === 0) return text;
  const parsed = parseSource(fileName, text);
  if (parsed.problem !== null) return text;
  const imports = parsed.program.body.filter(
    (s): s is ImportDeclaration => s.type === "ImportDeclaration",
  );
  const code = codeOnly(text, [...imports, ...parsed.comments]);
  const edits: TextEdit[] = [];
  for (const statement of imports) {
    const drop = new Set<number>();
    statement.specifiers.forEach((specifier, at) => {
      const name = specifier.local.name;
      if (candidates.has(name) && !uses(code, name)) drop.add(at);
    });
    if (drop.size === 0) continue;
    if (drop.size === statement.specifiers.length) edits.push(wholeStatement(text, statement));
    else edits.push(...planEntryRemoval(parsed, statement.specifiers, statement.start, drop));
  }
  return applyEdits(
    text,
    edits.sort((a, b) => a.start - b.start),
  );
}
