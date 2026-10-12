/* What GitHub's Markdown reads in running text as more than text wherever it
   stands: escapes, code, emphasis, strikethrough, HTML, a table's cells. */
const ALWAYS = /[\\`*~<>|]/g;
/* What it reads so only beside something else: an underscore at a word's
   edge — the one in `user_id` is plain — a bracket that leads to a link's
   target, an ampersand that starts an entity. */
const IN_PLACE = /(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])|\](?=[([])|&(?=#?\w+;)/gu;
const LINE_BREAKS = /[\r\n]+/g;

/**
 * Text for a Markdown table cell, list item or quote, shown as written:
 * every character Markdown would read as formatting escaped, a pipe among
 * them, and its line breaks as spaces.
 *
 * @param text - Anything a report quotes: a message, a reason, a name
 * @returns The text, safe to place in a line of Markdown
 * @example
 * ```ts
 * markdownText("was string | number, now Array<string>");
 * // "was string \\| number, now Array\\<string\\>"
 * ```
 */
export function markdownText(text: string): string {
  return text.replace(LINE_BREAKS, " ").replace(ALWAYS, "\\$&").replace(IN_PLACE, "\\$&");
}

/**
 * Text for a code span: a backtick, which would end the span, as a quote,
 * and its line breaks as spaces; in a table cell, its pipes escaped too,
 * which the table reads before the span. A code span shows every other
 * character as it is, a backslash included, so nothing else is escaped.
 *
 * @param text - A name or a path shown as code
 * @param where - Whether the span stands in a table cell; it does unless told otherwise
 * @returns The text, safe between the span's backticks
 * @example
 * ```ts
 * markdownCode("search | filter"); // "search \\| filter", for a table cell
 * markdownCode("search | filter", { table: false }); // "search | filter"
 * ```
 */
export function markdownCode(text: string, { table = true }: { table?: boolean } = {}): string {
  const span = text.replace(LINE_BREAKS, " ").replace(/`/g, "'");
  return table ? span.replace(/\|/g, "\\|") : span;
}
