/**
 * Tell whether a text holds a character that ends a line or that a
 * terminal acts on: C0 and C1 controls, DEL, and the line and paragraph
 * separators — none belongs in a name or a path Studio writes.
 *
 * @param text - The text
 * @returns Whether it holds one
 * @example
 * ```ts
 * hasControlCharacter("pets"); // false
 * hasControlCharacter("pets\u2028x"); // true
 * ```
 */
export function hasControlCharacter(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029)
      return true;
  }
  return false;
}
