/** A row that scrolls sideways: how far it has scrolled, and the width it shows. */
export interface ScrollView {
  scrollLeft: number;
  width: number;
}

/** An item of such a row: its offset from the row's start, and its width. */
export interface RowItem {
  left: number;
  width: number;
}

/**
 * Where a row that scrolls sideways should scroll to for one of its items
 * to be in full view with some room beside it — or where it is already,
 * when the item is in view. An item past either edge is brought just
 * inside that edge, so the row moves no further than it has to.
 *
 * @param view - The row's scroll position and the width it shows
 * @param item - The item's place in the row and its width
 * @param margin - The room kept beside the item, in pixels
 * @returns The scroll position to go to, never below 0
 * @example
 * ```ts
 * revealOffset({ scrollLeft: 0, width: 300 }, { left: 420, width: 90 }); // 226
 * revealOffset({ scrollLeft: 226, width: 300 }, { left: 40, width: 90 }); // 24
 * revealOffset({ scrollLeft: 0, width: 300 }, { left: 40, width: 90 }); // 0
 * ```
 */
export function revealOffset(view: ScrollView, item: RowItem, margin = 16): number {
  const start = item.left - margin;
  const end = item.left + item.width + margin;
  if (start < view.scrollLeft) return Math.max(0, start);
  if (end > view.scrollLeft + view.width) return end - view.width;
  return view.scrollLeft;
}
