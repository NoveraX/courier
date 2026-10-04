/* The Timeline's columns: the state, the method, the name, [the mode], the status, the duration, [the size], the time, the pin. */
const WIDE = "grid-cols-[10px_50px_minmax(0,1fr)_54px_44px_120px_64px_92px_14px]";
const NARROW = "grid-cols-[10px_50px_minmax(120px,1fr)_44px_104px_92px_14px]";

/** How wide the list must be for the Mode and Size columns. */
export const WIDE_FROM = 760;

/**
 * The Timeline's column template, with the Mode and Size columns when the
 * list is wide enough for them.
 *
 * @param wide - Whether it is
 * @returns The grid template class
 * @example
 * ```ts
 * columnsOf(true); // "grid-cols-[10px_50px_…]"
 * ```
 */
export function columnsOf(wide: boolean): string {
  return wide ? WIDE : NARROW;
}
