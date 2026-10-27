/** What a pane shows of a list: how far below the list's top its view starts, and how tall the view is. */
export interface PaneView {
  offset: number;
  height: number;
}

/** The rows of a list from the first to the last, by index; none when the last comes before the first. */
export interface RowSpan {
  first: number;
  last: number;
}

/* Rows drawn past either edge of the view, so a quick scroll does not show a gap. */
const OVERSCAN = 20;

/**
 * The rows of a list whose rows are all one height that a pane's view
 * shows, and a few past either edge. A list wholly out of view shows none.
 *
 * @param view - Where the view stands over the list
 * @param rowHeight - A row's height
 * @param count - How many rows the list has
 * @returns The rows
 * @example
 * ```ts
 * rowSpanOf({ offset: 2_500, height: 600 }, 25, 12_000); // { first: 80, last: 144 }
 * ```
 */
export function rowSpanOf({ offset, height }: PaneView, rowHeight: number, count: number): RowSpan {
  if (count === 0 || rowHeight <= 0) return { first: 0, last: -1 };
  return {
    first: Math.max(0, Math.floor(offset / rowHeight) - OVERSCAN),
    last: Math.min(count - 1, Math.ceil((offset + height) / rowHeight) + OVERSCAN),
  };
}
