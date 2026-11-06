import type { TextEdit } from "../migration";

/**
 * A text with edits made to it: each replaces its span of the text as it
 * was, so edits are given against the same text and applied together.
 *
 * @param text - The text
 * @param edits - Edits whose spans do not overlap; two at one point are made in the order given
 * @returns The text with them made
 * @throws {RangeError} When two edits' spans overlap, or one falls outside the text
 * @example
 * ```ts
 * applyEdits("import { a } from 'x';", [{ start: 9, end: 10, text: "b" }]); // "import { b } from 'x';"
 * ```
 */
export function applyEdits(text: string, edits: readonly TextEdit[]): string {
  const sorted = edits
    .map((edit, at) => ({ edit, at }))
    .sort((a, b) => a.edit.start - b.edit.start || a.edit.end - b.edit.end || a.at - b.at)
    .map(({ edit }) => edit);
  let out = "";
  let at = 0;
  for (const edit of sorted) {
    if (edit.start < at || edit.end < edit.start || edit.end > text.length)
      throw new RangeError(`Edits overlap or fall outside the text at ${edit.start}`);
    out += text.slice(at, edit.start) + edit.text;
    at = edit.end;
  }
  return out + text.slice(at);
}

/**
 * The line a point of a text is on, from 1.
 *
 * @param text - The text
 * @param at - The point
 * @returns Its line
 * @example
 * ```ts
 * lineAt("a\nb", 2); // 2
 * ```
 */
export function lineAt(text: string, at: number): number {
  let line = 1;
  for (
    let index = text.indexOf("\n");
    index !== -1 && index < at;
    index = text.indexOf("\n", index + 1)
  )
    line++;
  return line;
}
