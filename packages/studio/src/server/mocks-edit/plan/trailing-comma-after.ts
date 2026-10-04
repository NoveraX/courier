import { type CommentEnds, skipTrivia } from "./skip-trivia";

/**
 * Find the comma after a list's last item, looking past whitespace and
 * comments between them.
 *
 * @param text - The source text
 * @param itemEnd - Where the last item ends
 * @param comments - The file's comments by start
 * @returns The comma's offset, or `null` when the list has no trailing comma
 *
 * @example
 * ```ts
 * trailingCommaAfter("{ a: 1 , }", 6, comments); // → 7
 * ```
 */
export function trailingCommaAfter(
  text: string,
  itemEnd: number,
  comments: CommentEnds,
): number | null {
  const next = skipTrivia(text, itemEnd, comments);
  return text[next] === "," ? next : null;
}
