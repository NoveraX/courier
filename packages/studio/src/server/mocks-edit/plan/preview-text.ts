/* Long enough to recognise a statement or a callee by, short enough for one line of a message. */
const PREVIEW_LENGTH = 60;

/**
 * Code quoted in a message: on one line, and cut after 60 characters.
 *
 * @param text - The code
 * @returns Its whitespace runs folded to single spaces, ending with `…` when cut
 *
 * @example
 * ```ts
 * previewText("export default {\n  users: 1,\n};"); // → "export default { users: 1, };"
 * ```
 */
export function previewText(text: string): string {
  const line = text.replace(/\s+/g, " ");
  return line.length > PREVIEW_LENGTH ? `${line.slice(0, PREVIEW_LENGTH)}…` : line;
}
