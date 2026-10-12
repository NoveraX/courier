/** Where an item sits along a row that scrolls sideways, in the row's content: its start and width. */
export interface RowItem {
  start: number;
  width: number;
}

/** A row that scrolls sideways: the width it shows, and the width of all it holds. */
export interface ScrollingRow {
  width: number;
  content: number;
}

/**
 * How far a row that scrolls sideways scrolls to put one of its items in
 * its middle, so the items either side show too — never before its start
 * or past its end. A row that holds no more than it shows does not scroll.
 *
 * @param item - The item's start and width along the row's content
 * @param row - The row's visible width and its content's width
 * @returns The row's scroll offset, in pixels
 * @example
 * ```ts
 * centeredScroll({ start: 400, width: 80 }, { width: 300, content: 600 }); // 300
 * centeredScroll({ start: 20, width: 80 }, { width: 300, content: 600 }); // 0
 * ```
 */
export function centeredScroll(item: RowItem, row: ScrollingRow): number {
  const furthest = Math.max(0, row.content - row.width);
  const centered = item.start - (row.width - item.width) / 2;
  return Math.round(Math.min(furthest, Math.max(0, centered)));
}
