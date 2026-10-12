/* What GitHub's Markdown reads in running text as more than text wherever it
   stands: escapes, code, emphasis, strikethrough, HTML, a table's cells. */
const ALWAYS = /[\\`*~<>|]/g;
/* What it reads so only beside something else: an underscore at a word's
   edge — the one in `user_id` is plain — a bracket that leads to a link's
   target, an ampersand that starts an entity. */
const IN_PLACE = /(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])|\](?=[([])|&(?=#?\w+;)/gu;
const LINE_BREAKS = /[\r\n]+/g;

/**
 * Text for a Markdown table cell, shown as written: every character
 * Markdown would read as formatting escaped, a pipe among them, and its line
 * breaks as spaces.
 *
 * @param text - A finding's detail
 * @returns The text, safe in a table cell
 * @example
 * ```ts
 * markdownText("Array<string> | null"); // "Array\\<string\\> \\| null"
 * ```
 */
export function markdownText(text: string): string {
  return text.replace(LINE_BREAKS, " ").replace(ALWAYS, "\\$&").replace(IN_PLACE, "\\$&");
}

/**
 * Text for a code span in a Markdown table cell: its pipes escaped, which
 * the table reads before the span, a backtick, which would end the span, as
 * a quote, and its line breaks as spaces. A code span shows every other
 * character as it is, a backslash included.
 *
 * @param text - An endpoint's label
 * @returns The text, safe between the span's backticks
 * @example
 * ```ts
 * markdownCode("GET /search|all"); // "GET /search\\|all"
 * ```
 */
export function markdownCode(text: string): string {
  return text.replace(LINE_BREAKS, " ").replace(/`/g, "'").replace(/\|/g, "\\|");
}
