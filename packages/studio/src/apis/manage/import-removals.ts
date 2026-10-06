import type { ImportDeclaration } from "oxc-parser";
import { lineStart } from "../../server/mocks-edit/plan/line-start";
import type { ParsedSource } from "../../server/mocks-edit/plan/parse-source";
import type { TextEdit } from "../../server/mocks-edit/types";
import { planEntryRemoval } from "./entry-removal";

function wholeStatement(text: string, statement: ImportDeclaration): TextEdit {
  const eol = text.indexOf("\n", statement.end);
  return {
    start: lineStart(text, statement.start),
    end: eol === -1 ? text.length : eol + 1,
    text: "",
  };
}

/**
 * Plan taking imported names out of a file: each name `drop` picks goes
 * from its import, and an import left with no name goes whole, with its
 * line. Every other character stays as it is.
 *
 * @param parsed - The file, parsed
 * @param drop - Whether an imported name goes, by the name the file binds
 * @returns The removals, in text order
 * @example
 * ```ts
 * applyEdits(text, planImportRemovals(parsed, (name) => name === "petstore"));
 * ```
 */
export function planImportRemovals(
  parsed: ParsedSource,
  drop: (name: string) => boolean,
): TextEdit[] {
  const edits: TextEdit[] = [];
  for (const statement of parsed.program.body) {
    if (statement.type !== "ImportDeclaration") continue;
    const going = new Set<number>();
    statement.specifiers.forEach((specifier, at) => {
      if (drop(specifier.local.name)) going.add(at);
    });
    if (going.size === 0) continue;
    if (going.size === statement.specifiers.length)
      edits.push(wholeStatement(parsed.text, statement));
    else edits.push(...planEntryRemoval(parsed, statement.specifiers, statement.start, going));
  }
  return edits.sort((a, b) => a.start - b.start);
}
