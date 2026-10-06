/* What a summary above a caller is kept within. */
const SUMMARY_LIMIT = 200;
/* The end of a sentence: a full stop, `!` or `?` before a space — not the dot inside `3.0`. */
const SENTENCE_END = /[.!?](?=\s)/g;

/**
 * The first paragraph of a specification's description, to sum the API up
 * in a comment: up to the first blank line, skipping Markdown headings, its
 * lines joined as the Markdown renders them. A paragraph longer than the
 * limit ends at the last sentence that fits, or else at the last word,
 * marked with an ellipsis — never in the middle of a word.
 *
 * @param description - The specification's description, Markdown
 * @param limit - The longest summary, in characters
 * @returns The summary, or `""` when the description has no paragraph
 * @example
 * ```ts
 * firstParagraph("# Shop\n\nSells pets.\nShips them too.\n\nMore below.");
 * // → "Sells pets. Ships them too."
 * ```
 */
export function firstParagraph(description: string, limit = SUMMARY_LIMIT): string {
  const paragraph = description
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split("\n")
        .filter((line) => !line.trim().startsWith("#"))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .find((block) => block !== "");
  if (paragraph === undefined) return "";
  if (paragraph.length <= limit) return paragraph;
  const sentences = [...paragraph.slice(0, limit + 1).matchAll(SENTENCE_END)];
  const lastSentence = sentences.at(-1);
  if (lastSentence?.index !== undefined) return paragraph.slice(0, lastSentence.index + 1);
  const lastSpace = paragraph.lastIndexOf(" ", limit);
  return `${paragraph.slice(0, lastSpace > 0 ? lastSpace : limit)}…`;
}
