import type { ImportDeclaration } from "oxc-parser";
import type { TextEdit } from "../types";
import { planListInsertion } from "./list-insertion";
import type { ParsedSource } from "./parse-source";
import { skipTrivia } from "./skip-trivia";
import type { FileStyle } from "./types";

const IMPORT_KEYWORD = "import".length;

/**
 * Plan adding names to an existing `import { ... }`, inside its braces and
 * in its layout: on lines of their own when its closing brace has one,
 * after the last name otherwise.
 *
 * @param parsed - The parsed file
 * @param declaration - A value import with only named specifiers
 * @param names - The names to add, each imported under its own name
 * @param style - The file's style
 * @returns The insertions, or `null` when the braces are not where the syntax puts them
 *
 * @example
 * ```ts
 * // import { defineMocks } from "@noverax/courier-mock";
 * planImportJoin(parsed, declaration, ["defineMockServer"], style);
 * // → [{ start: 20, end: 20, text: ", defineMockServer" }]
 * ```
 */
export function planImportJoin(
  parsed: ParsedSource,
  declaration: ImportDeclaration,
  names: readonly string[],
  style: FileStyle,
): TextEdit[] | null {
  const { text, commentEnds } = parsed;
  const last = declaration.specifiers[declaration.specifiers.length - 1];
  if (last === undefined) return null;
  const open = skipTrivia(text, declaration.start + IMPORT_KEYWORD, commentEnds);
  const afterLast = skipTrivia(text, last.end, commentEnds);
  const close = text[afterLast] === "," ? skipTrivia(text, afterLast + 1, commentEnds) : afterLast;
  if (text[open] !== "{" || text[close] !== "}") return null;
  const list = { open, close, items: declaration.specifiers };
  const site = { text, comments: parsed.comments, commentEnds, style, singleLineFile: false };
  return planListInsertion(list, site, () => [...names]);
}
