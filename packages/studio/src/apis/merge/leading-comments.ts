import type { Comment } from "oxc-parser";

/**
 * Where the comments right above a place in a file start: the first of the
 * comments that follow one another up to it, each on a line of its own, with
 * nothing but whitespace between — a note above an endpoint, its doc comment,
 * or both. A comment that ends a line of code belongs to that code, so it
 * stops the run.
 *
 * @param content - The file's text
 * @param comments - The comments oxc read from it, in the order they appear
 * @param start - The place, as an offset into the text
 * @returns The offset the first such comment starts at, or `start` when there is none
 * @example
 * ```ts
 * leadingCommentsStart("// Users\nlist: x,", comments, 9); // 0
 * ```
 */
export function leadingCommentsStart(
  content: string,
  comments: readonly Comment[],
  start: number,
): number {
  let at = start;
  for (let index = comments.length - 1; index >= 0; index--) {
    const comment = comments[index];
    if (comment === undefined || comment.end > at) continue;
    if (content.slice(comment.end, at).trim() !== "") break;
    const line = content.lastIndexOf("\n", comment.start - 1) + 1;
    if (content.slice(line, comment.start).trim() !== "") break;
    at = comment.start;
  }
  return at;
}
