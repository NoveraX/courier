import { WHITESPACE } from "./whitespace";

/** Where each comment ends, by where it starts, so a scan can jump over one it lands on. */
export type CommentEnds = ReadonlyMap<number, number>;

/**
 * Step over whitespace, line breaks and comments.
 *
 * @param text - The source text
 * @param from - Where to start
 * @param comments - The file's comments by start
 * @returns The offset of the next code character, or the text's length
 *
 * @example
 * ```ts
 * skipTrivia("a // x\n  , b", 1, comments); // → 9
 * ```
 */
export function skipTrivia(text: string, from: number, comments: CommentEnds): number {
  let at = from;
  while (at < text.length) {
    const end = comments.get(at);
    if (end !== undefined) {
      at = end;
      continue;
    }
    if (!WHITESPACE.test(text.charAt(at))) break;
    at += 1;
  }
  return at;
}

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
