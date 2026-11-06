import { appendedText, withoutBom } from "./append-text";

/** The line a file of an editor's own rules reads AGENTS.md with, and with it Courier's block. */
export const IMPORT_AGENTS = "@AGENTS.md";

/* `@AGENTS.md` or `@./AGENTS.md`, at a line's start or after a space, with no more of a path after it. */
const IMPORTS = /(?:^|\s)@(?:\.\/)?AGENTS\.md(?![\w./-])/m;

/**
 * Whether a file of an editor's own rules reads AGENTS.md already: a line
 * of it, or a word among others, names it as `@AGENTS.md`.
 *
 * @param text - The file's text
 * @returns `true` where it does
 * @example
 * ```ts
 * importsAgents("See @AGENTS.md first.\n"); // true
 * ```
 */
export function importsAgents(text: string): boolean {
  return IMPORTS.test(text);
}

/**
 * A file of an editor's own rules that reads AGENTS.md: the line added at
 * its end, after an empty line, where it reads it not yet — a new file is
 * the line alone — its BOM and line ends as they were.
 *
 * @param text - The file's text, `""` for a new file
 * @returns The text with the line, or the text itself where it reads AGENTS.md already
 * @example
 * ```ts
 * withAgentsImport("# Rules\n"); // "# Rules\n\n@AGENTS.md\n"
 * ```
 */
export function withAgentsImport(text: string): string {
  if (importsAgents(text)) return text;
  const { bom, body } = withoutBom(text);
  return `${bom}${appendedText(body, IMPORT_AGENTS)}`;
}
