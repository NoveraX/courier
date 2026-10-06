import type { ImportDeclaration } from "oxc-parser";
import type { ParsedSource } from "../../server/mocks-edit/plan/parse-source";

/* The code with its imports and comments blanked out, offsets kept. */
function codeOnly(text: string, spans: ReadonlyArray<{ start: number; end: number }>): string {
  let code = text;
  for (const { start, end } of spans)
    code = code.slice(0, start) + " ".repeat(end - start) + code.slice(end);
  return code;
}

/**
 * Tell whether a file's code mentions a name anywhere but in its imports
 * and comments. A mention inside a string counts too: a name kept for one
 * is never wrong, only one dropped while still in use is.
 *
 * @param parsed - The file, parsed
 * @returns Whether the code mentions a name
 * @example
 * ```ts
 * const mentions = codeMentions(parseSource("index.ts", text));
 * mentions("PetSchema"); // → false once nothing but its import names it
 * ```
 */
export function codeMentions(parsed: ParsedSource): (name: string) => boolean {
  const imports = parsed.program.body.filter(
    (s): s is ImportDeclaration => s.type === "ImportDeclaration",
  );
  const code = codeOnly(parsed.text, [...imports, ...parsed.comments]);
  return (name) => new RegExp(`(?<![\\w$])${name.replaceAll("$", "\\$")}(?![\\w$])`).test(code);
}
