/** A logged request's row on one line, to a mouse. */
const LINE = 34;
/** The same row to a finger, which needs the room to land. */
const TOUCH_LINE = 44;
/** A row on two lines, in a list too narrow for the columns. */
const STACKED = 52;

/**
 * How tall a row of a mock's log is, so the list knows where each row sits
 * without measuring it: two lines in a narrow list; one line, taller for a
 * finger than for a mouse, in a wide one.
 *
 * @param stacked - Whether the rows are on two lines
 * @param coarse - Whether the pointer is a finger
 * @returns The row's height, in pixels
 * @example
 * ```ts
 * logRowHeight(false, false); // 34
 * logRowHeight(false, true); // 44
 * logRowHeight(true, false); // 52
 * ```
 */
export function logRowHeight(stacked: boolean, coarse: boolean): number {
  if (stacked) return STACKED;
  return coarse ? TOUCH_LINE : LINE;
}
