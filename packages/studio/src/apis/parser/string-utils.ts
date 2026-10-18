/**
 * String manipulation utilities: HTML stripping, entity decoding.
 */

/* A tag holds no `<` of its own, so a run of them is passed over in linear time. */
const TAG = /<[^<>]*>/g;
const ENTITY = /&(amp|lt|gt|quot|#39);/g;
const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
};

/* Each entity read once: `&amp;lt;` is the text `&lt;`, not `<`. The text is
   prose for comments and the page, never HTML again. */
function plainText(html: string): string {
  return html
    .split(TAG)
    .join("")
    .replace(ENTITY, (entity, name: string) => ENTITIES[name] ?? entity);
}

/**
 * A description written in HTML as plain text on one line: tags dropped,
 * the common entities read, white space collapsed.
 *
 * @param html - A tag's description, as the specification has it
 * @returns The text, to be read as text: it is no HTML, and may read like a tag
 * @example
 * ```ts
 * stripHtml("<p>Pets &amp; <b>owners</b></p>"); // "Pets & owners"
 * ```
 */
export function stripHtml(html: string): string {
  return plainText(html).replace(/\s+/g, " ").trim();
}

/**
 * A description written in HTML as plain text, its lines kept: tags
 * dropped, the common entities read, other white space collapsed.
 *
 * @param html - An API's description, as the specification has it
 * @returns The text
 * @example
 * ```ts
 * stripHtmlPreserveNewlines("A <i>pet</i>  store\nfor &quot;all&quot;"); // 'A pet store\nfor "all"'
 * ```
 */
export function stripHtmlPreserveNewlines(html: string): string {
  return plainText(html)
    .replace(/[^\S\n]+/g, " ")
    .trim();
}

/**
 * Read a specification field that is meant to hold prose.
 *
 * A specification may put anything where prose is expected — DigitalOcean
 * writes tag descriptions as an external `$ref`, so the value arrives as an
 * object and every string operation on it throws. Fields like this are
 * documentation: an unusable one is skipped, never fatal.
 *
 * @param value - Whatever the specification had at that key
 * @returns The text when there is usable text, otherwise `undefined`
 */
export function specText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
