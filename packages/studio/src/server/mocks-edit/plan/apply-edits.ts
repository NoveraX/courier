import type { TextEdit } from "../types";

/**
 * Apply edits to a text.
 *
 * @param text - The text before the edit
 * @param edits - Edits in ascending order, not overlapping
 * @returns The text after the edit
 *
 * @example
 * ```ts
 * applyEdits("abc", [{ start: 1, end: 1, text: "X" }, { start: 2, end: 3, text: "Y" }]); // → "aXbY"
 * ```
 */
export function applyEdits(text: string, edits: readonly TextEdit[]): string {
  let result = "";
  let from = 0;
  for (const edit of edits) {
    result += text.slice(from, edit.start) + edit.text;
    from = edit.end;
  }
  return result + text.slice(from);
}
