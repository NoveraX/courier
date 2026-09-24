import type { TextEdit } from "../types";
import { applyEdits } from "./apply-edits";

/**
 * Whether edits only insert: each one replaces nothing and adds something,
 * they come in ascending order with no two at one offset, each lies inside
 * the old text, and together they turn it into exactly `newText`.
 *
 * @param oldText - The text before the edit
 * @param newText - The text the edits are claimed to produce
 * @param edits - The edits
 * @returns `true` when the edits are pure insertions that produce `newText`
 *
 * @example
 * ```ts
 * isPureInsertion("{}", "{ a }", [{ start: 1, end: 1, text: " a " }]); // → true
 * ```
 */
export function isPureInsertion(
  oldText: string,
  newText: string,
  edits: readonly TextEdit[],
): boolean {
  let previous = -1;
  for (const edit of edits) {
    if (edit.start !== edit.end || edit.text.length === 0) return false;
    if (edit.start <= previous || edit.start > oldText.length) return false;
    previous = edit.start;
  }
  return applyEdits(oldText, edits) === newText;
}
