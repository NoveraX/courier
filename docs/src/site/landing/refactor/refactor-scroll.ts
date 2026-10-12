import type { LineState } from "./refactor-frame"

function shown(state: LineState): boolean {
  return state !== "gone" && state !== "hidden"
}

function changed(state: LineState): boolean {
  return state === "struck" || state === "added"
}

/**
 * How far the code is scrolled in a window shorter than it: just far enough
 * that the line changed last — struck, or added — shows with the line after
 * it, as an editor follows an edit; not at all before the first change, and
 * never past the last line.
 *
 * @param lines - Each line's state in the frame shown
 * @param lineHeight - The line height, in px
 * @param window - The window's height for the lines, in px
 * @returns How far the lines are scrolled up, in px
 * @example
 * ```ts
 * codeScroll(refactorFrame(0.3).lines, 14, 144) // the last struck line in view
 * ```
 */
export function codeScroll(
  lines: readonly LineState[],
  lineHeight: number,
  window: number
): number {
  const rows = lines.filter(shown)
  const last = rows.findLastIndex(changed)
  if (last < 0) return 0
  const end = Math.min(rows.length, last + 2) * lineHeight
  return Math.max(0, Math.min(rows.length * lineHeight - window, end - window))
}
