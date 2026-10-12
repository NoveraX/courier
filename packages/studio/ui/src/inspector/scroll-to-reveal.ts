/** A stretch along a row that scrolls sideways: where it starts and how wide it is, in pixels. */
export interface ScrollSpan {
  start: number;
  size: number;
}

/**
 * Where a row that scrolls sideways should scroll to for an item in it to
 * show whole, with a margin that lets its neighbour peek in so the reader
 * sees there is more: where it is when the item already shows, otherwise
 * the least move that shows it — or, for an item wider than the row, the
 * move that shows its start.
 *
 * @param view - The part of the row in view: its scroll offset and its width
 * @param item - The item, measured from the row's start
 * @param margin - How much of the row beyond the item should show too
 * @returns The scroll offset to set
 * @example
 * ```ts
 * scrollToReveal({ start: 0, size: 300 }, { start: 280, size: 60 }, 24); // 64
 * scrollToReveal({ start: 0, size: 300 }, { start: 40, size: 60 }, 24); // 0
 * ```
 */
export function scrollToReveal(view: ScrollSpan, item: ScrollSpan, margin: number): number {
  const start = Math.max(0, item.start - margin);
  if (start < view.start || item.size + 2 * margin > view.size) return start;
  const end = item.start + item.size + margin;
  return end > view.start + view.size ? end - view.size : view.start;
}
