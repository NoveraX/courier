/* The overflow values that let a person scroll a box. */
const SCROLLING = new Set(["auto", "scroll", "overlay"]);

/**
 * The box a person scrolls to move an element up and down: the nearest one
 * around it that scrolls that way and holds more than it shows. A box sized
 * to what it holds, as a frame that scrolls only sideways is, does not move
 * the element and is passed by.
 *
 * @param element - The element
 * @returns The box; `null` when no box around the element scrolls it; `undefined` while the element is not laid out, inside a hidden pane say, when nothing can be told yet
 * @example
 * ```ts
 * scrollParentOf(rows); // the pane the rows scroll in
 * ```
 */
export function scrollParentOf(element: Element): HTMLElement | null | undefined {
  if (element.getClientRects().length === 0) return undefined;
  for (let box = element.parentElement; box; box = box.parentElement) {
    /* A pixel of rounding between the two heights is not something to scroll. */
    const overflows = box.scrollHeight - box.clientHeight > 1;
    if (overflows && SCROLLING.has(getComputedStyle(box).overflowY)) return box;
  }
  return null;
}
