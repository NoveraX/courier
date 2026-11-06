import { sliceWhole } from "./slice-whole";

const WHITESPACE = /\s/;
/* The last word of a text, with the space before it. */
const LAST_WORD = /\s\S*$/;

/**
 * The start of a text, at most `length` characters with "…" in place of
 * the rest, cut where a word ends: the word the cut falls inside is dropped
 * rather than shown in part, since half a token is still a token, and a
 * redaction that reads the text after it knows a token only whole.
 *
 * @param text - The text
 * @param length - The most characters kept, the ellipsis among them
 * @returns The text, or its start
 * @example
 * ```ts
 * wordsUpTo("pay with tok_live_abc", 12); // → "pay with…"
 * ```
 */
export function wordsUpTo(text: string, length: number): string {
  if (text.length <= length) return text;
  const kept = sliceWhole(text, length - 1);
  const whole = WHITESPACE.test(text.charAt(kept.length))
    ? kept
    : kept.slice(0, kept.search(LAST_WORD) + 1);
  return `${whole.trimEnd()}…`;
}
