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

/** Below this width the editor's status line is two lines tall, so that it shows whole. */
export const STATUS_WRAPS = 420

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
export function codeLineHeight({ width, height, narrative }: StageRoom): number {
  const twoColumns = width >= TWO_COLUMNS
  const top = Math.max(16, Math.min(32, height * 0.03)) + 28
  const above = twoColumns ? 0 : narrative + 14
  const status = width < STATUS_WRAPS ? 44 : 34
  const room = height - 56 - top - above - 42 - 24 - status - 16
  return Math.max(14, Math.min(23, Math.floor(room / OLD_LINES.length)))
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
