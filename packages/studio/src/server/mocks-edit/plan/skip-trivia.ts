import type { CommentEnds } from "@noverax/courier-cli/devkit";

import { WHITESPACE } from "./whitespace";

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
