import type { DiffHunk } from "./wire-types";

/**
 * Count the lines a diff adds and removes.
 *
 * @param hunks - The diff's hunks
 * @returns How many lines are added and how many removed
 *
 * @example
 * ```ts
 * diffStats([{ lines: [{ kind: "add", text: "x", oldLine: null, newLine: 1 }] }]);
 * // → { added: 1, removed: 0 }
 * ```
 */
export function diffStats(hunks: readonly DiffHunk[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.kind === "add") added++;
      else if (line.kind === "remove") removed++;
    }
  }
  return { added, removed };
}
