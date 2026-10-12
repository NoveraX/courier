import type { ListTier } from "@/design/breakpoints";

/* The Timeline's columns: the method, the name, [the mode], the status, the duration, [the size], the time, the pin. */
const WIDE = "grid-cols-[50px_minmax(0,1fr)_54px_44px_120px_64px_92px_14px]";
const NARROW = "grid-cols-[50px_minmax(120px,1fr)_44px_104px_92px_14px]";

/** How wide the list must be for the Mode and Size columns. */
export const WIDE_FROM = 760;

/** How tall the head of a group of rows is: the pinned requests, or the live ones. */
export const GROUP_HEIGHT = 28;

/**
 * The Timeline's column template, with the Mode and Size columns when the
 * list is wide enough for them.
 *
 * @param wide - Whether it is
 * @returns The grid template class
 * @example
 * ```ts
 * columnsOf(true); // "grid-cols-[50px_minmax(0,1fr)_…]"
 * ```
 */
export function columnsOf(wide: boolean): string {
  return wide ? WIDE : NARROW;
}

/**
 * How tall a request's row is: two lines where the list is too narrow for
 * its columns, one line otherwise — and that line taller under a finger,
 * so a tap lands on the row it means.
 *
 * @param tier - How the list lays out its rows
 * @param coarse - Whether a finger points rather than a mouse
 * @returns The row's height in pixels
 * @example
 * ```ts
 * rowHeightOf("narrow", false); // 34
 * rowHeightOf("narrow", true); // 44
 * rowHeightOf("stacked", true); // 52
 * ```
 */
export function rowHeightOf(tier: ListTier, coarse: boolean): number {
  if (tier === "stacked") return 52;
  return coarse ? 44 : 34;
}
