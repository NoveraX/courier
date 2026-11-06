/* An escape a string or an identifier may spell a character with, and the sequence after its backslash. */
const ESCAPE = /\\(u\{[0-9a-fA-F]{1,6}\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[0-7]{1,3}|\r\n|[\s\S])/g;
const LINE_END = /^(?:\r\n|[\r\n\u2028\u2029])$/;

/* What one escape spells: a code point, a character, nothing for a line continued, else the character escaped. */
function spelled(sequence: string): string {
  if (sequence.startsWith("u{")) {
    const point = Number.parseInt(sequence.slice(2, -1), 16);
    return point <= 0x10ffff ? String.fromCodePoint(point) : "";
  }
  if (/^[ux][0-9a-fA-F]/.test(sequence))
    return String.fromCharCode(Number.parseInt(sequence.slice(1), 16));
  if (/^[0-7]/.test(sequence)) return String.fromCharCode(Number.parseInt(sequence, 8));
  return LINE_END.test(sequence) ? "" : sequence;
}

/**
 * Whether a text writes one of the words: as it is, or spelled with the
 * escapes a string or an identifier takes — `A`, `\u{41}`, `\x41`,
 * `\101`, `\A`, a line continued — which the parser reads as the word.
 * An escape read where it spells nothing, in a regular expression or a
 * comment, only finds a word where there is none: the answer errs on the
 * side of reading the file.
 *
 * @param text - A file's text
 * @param words - The words
 * @returns Whether the file may name one
 * @example
 * ```ts
 * mentions('import { is\\u0048TTPError } from "@noverax/courier";', ["isHTTPError"]); // true
 * ```
 */
export function mentions(text: string, words: readonly string[]): boolean {
  if (words.some((word) => text.includes(word))) return true;
  if (!text.includes("\\")) return false;
  const unescaped = text.replace(ESCAPE, (_, sequence: string) => spelled(sequence));
  return words.some((word) => unescaped.includes(word));
}
