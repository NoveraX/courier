import { OLD_LINES } from "./refactor-code"

/** The room the refactor's stage has: the window, and the narrative above the code on a narrow one. */
export interface StageRoom {
  width: number
  /** The window's height with a phone's toolbars shown, so the code fits while they show. */
  height: number
  /** The narrative's height, which sits above the code below 980 px. */
  narrative: number
}

/** From this width the narrative and the code sit side by side. */
export const TWO_COLUMNS = 980

/** A window at least `from` wide yet shorter than `below` — a phone held sideways — has them side by side too. */
export const SIDEWAYS = { from: 640, below: 520 } as const

/** Below this width the editor's status line is two lines tall, so that it shows whole. */
export const STATUS_WRAPS = 420

/**
 * Whether the narrative sits beside the code rather than above it: from
 * {@link TWO_COLUMNS} wide, and in a window wide but short — a phone held
 * sideways — whose height the code needs all of.
 *
 * @param room - The window
 * @returns `true` when the narrative is beside the code
 * @example
 * ```ts
 * narrativeBeside({ width: 844, height: 360 }) // true
 * ```
 */
export function narrativeBeside({ width, height }: Pick<StageRoom, "width" | "height">): boolean {
  return width >= TWO_COLUMNS || (width >= SIDEWAYS.from && height < SIDEWAYS.below)
}

/**
 * The height the code's lines have in the window below the header: what is
 * left once the stage's padding, the narrative above the code if it is
 * there, the editor's tabs and its status line have theirs.
 *
 * @param room - The window and the narrative
 * @returns The lines' room, in px
 * @example
 * ```ts
 * codeRoom({ width: 1440, height: 900, narrative: 0 }) // 673
 * ```
 */
export function codeRoom(room: StageRoom): number {
  const top = Math.max(16, Math.min(32, room.height * 0.03)) + 28
  const above = narrativeBeside(room) ? 0 : room.narrative + 14
  const status = room.width < STATUS_WRAPS ? 44 : 34
  return room.height - 56 - top - above - 42 - 24 - status - 16
}

/**
 * How tall a line of the refactor's code is, so that all twenty hand-written
 * lines fit the window below the header — between 14 and 23 px.
 *
 * @param room - The window and the narrative
 * @returns The line height, in px
 * @example
 * ```ts
 * codeLineHeight({ width: 1440, height: 900, narrative: 0 }) // 23
 * ```
 */
export function codeLineHeight(room: StageRoom): number {
  return Math.max(14, Math.min(23, Math.floor(codeRoom(room) / OLD_LINES.length)))
}

/**
 * How tall the window onto the code is when not all twenty lines fit even
 * at their shortest — on a phone held sideways, or a small one — so that
 * the editor shows the lines being changed, as an editor scrolled to them
 * would; `undefined` when they all fit. Never under four lines.
 *
 * @param room - The window and the narrative
 * @param lineHeight - The line height, in px
 * @returns The window's height for the lines, in px, or `undefined`
 * @example
 * ```ts
 * codeWindow({ width: 844, height: 360, narrative: 0 }, 14) // 144
 * ```
 */
export function codeWindow(room: StageRoom, lineHeight: number): number | undefined {
  const lines = codeRoom(room)
  return lines >= OLD_LINES.length * lineHeight
    ? undefined
    : Math.floor(Math.max(lines, 4 * lineHeight))
}

/**
 * The code's type size for a line height: about half of it, 10 to 12 px.
 *
 * @param lineHeight - The line height, in px
 * @returns The type size, in px
 * @example
 * ```ts
 * codeFontSize(23) // 12
 * ```
 */
export function codeFontSize(lineHeight: number): number {
  return Math.max(10, Math.min(12, Math.round(lineHeight * 0.53 * 10) / 10))
}
