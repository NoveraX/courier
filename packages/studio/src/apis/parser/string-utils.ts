/**
 * String manipulation utilities: HTML stripping, entity decoding.
 */

/** Strip HTML tags and decode basic entities from tag descriptions */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip HTML but preserve newlines (for multi-line descriptions) */
export function stripHtmlPreserveNewlines(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
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
