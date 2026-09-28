import type { Comment } from "oxc-parser";

/**
 * The doc comment right above an entry, with nothing but whitespace between.
 *
 * @param content - The file's text
 * @param comments - The comments oxc read from it
 * @param start - Where the entry starts
 * @returns The comment, or `null` when the entry has none right above it
 * @example
 * ```ts
 * docCommentBefore(text, parsed.comments, property.start)?.value; // "* Find pets by status "
 * ```
 */
export function docCommentBefore(
  content: string,
  comments: readonly Comment[],
  start: number,
): Comment | null {
  const before = comments
    .filter((c) => c.end <= start && c.type === "Block" && c.value.startsWith("*"))
    .at(-1);
  if (before === undefined || content.slice(before.end, start).trim() !== "") return null;
  return before;
}
