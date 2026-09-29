import { useEffect } from "react";

/** How far below the head a reader can be and still follow new entries: three rows. */
const SCROLL_THRESHOLD = 36 * 3;

/**
 * Keep the newest entries of a newest-first list in view as they arrive.
 *
 * A reader at or just below the head of the list is brought back to it; a
 * reader who scrolled further down to older entries is left where they are.
 *
 * @param ref - The list's scroll container
 * @param count - How many entries the list shows; a change triggers the follow
 * @param enabled - Whether following is on
 *
 * @example
 * ```tsx
 * useAutoScroll(scrollRef, requests.length, shouldAutoScroll);
 * ```
 */
export function useAutoScroll(
  ref: React.RefObject<HTMLDivElement | null>,
  count: number,
  enabled: React.MutableRefObject<boolean>,
): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new entry, counted, is what brings the reader back to the head
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled.current) return;

    if (el.scrollTop < SCROLL_THRESHOLD) {
      el.scrollTop = 0;
    }
  }, [count, ref, enabled]);
}
