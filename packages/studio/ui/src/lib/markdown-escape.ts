/* What GitHub's Markdown reads in running text as more than text wherever it
   stands: escapes, code, emphasis, strikethrough, HTML, a table's cells. */
const ALWAYS = /[\\`*~<>|]/g;
/* What it reads so only beside something else: an underscore at a word's
   edge — the one in `user_id` is plain — a bracket that leads to a link's
   target, an ampersand that starts an entity. */
const IN_PLACE = /(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])|\](?=[([])|&(?=#?\w+;)/gu;
/* What GitHub links however it is escaped, since it reads the text a backslash
   leaves: a mention — a name after an `@` that no ASCII letter, digit or
   underscore precedes — and a reference to an issue: `#1`, `acme/shop#1`,
   `GH-1`. A zero-width space after the sign leaves nothing to link. */
const REFERENCES = /(?<![A-Za-z0-9_])@(?=[A-Za-z0-9])|#(?=\d)|(?<![A-Za-z0-9_])gh-(?=\d)/gi;
/* A dollar sign opens math. A backslash keeps it text for CommonMark's math
   extensions, but GitHub reads past it and opens math at a dollar sign that
   starts the text or follows a space or a parenthesis — never at one after a
   zero-width space, so one goes before each dollar sign too. */
const DOLLAR = /\$/g;
const LINE_BREAKS = /[\r\n]+/g;
/* Shows as nothing and is no space to Markdown, so it parts characters
   without changing what a reader sees. */
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);

/**
 * Text for a line of Markdown — a table cell, a heading, a quote — shown
 * as written: every character Markdown would read as formatting escaped, a
 * pipe among them, its line breaks as spaces, and nothing in it that GitHub
 * would turn into a mention that notifies someone, a link to an issue that
 * the issue then lists, or math.
 *
 * @param text - A finding's title, description or detail
 * @returns The text, safe in a line of Markdown
 * @example
 * ```ts
 * markdownText("Array<string> | null"); // "Array\\<string\\> \\| null"
 * markdownText("@octocat, see #12"); // "@\u200Boctocat, see #\u200B12"
 * ```
 */
export function markdownText(text: string): string {
  return text
    .replace(LINE_BREAKS, " ")
    .replace(ALWAYS, "\\$&")
    .replace(IN_PLACE, "\\$&")
    .replace(REFERENCES, (sign) => `${sign}${ZERO_WIDTH_SPACE}`)
    .replace(DOLLAR, (dollar) => `${ZERO_WIDTH_SPACE}\\${dollar}`);
}

/**
 * Text for a code span in a Markdown table cell: its pipes escaped, which
 * the table reads before the span, a backtick, which would end the span, as
 * a quote, and its line breaks as spaces. A code span shows every other
 * character as it is, a backslash included — save that a backslash before a
 * pipe is parted from it by a zero-width space: micromark and marked read
 * the two backslashes there as one escaped backslash, and the pipe after
 * them would end the cell.
 *
 * @param text - An endpoint's label
 * @returns The text, safe between the span's backticks
 * @example
 * ```ts
 * markdownCode("GET /search|all"); // "GET /search\\|all"
 * markdownCode("a\\|b"); // "a\\\u200B\\|b"
 * ```
 */
export function markdownCode(text: string): string {
  return text
    .replace(LINE_BREAKS, " ")
    .replace(/`/g, "'")
    .replace(/\\(?=\|)/g, `\\${ZERO_WIDTH_SPACE}`)
    .replace(/\|/g, "\\|");
}
