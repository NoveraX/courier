import { useLayoutEffect } from "react";

import { centeredScroll } from "./centered-scroll";

/**
 * Keeps the current item of a row that scrolls sideways — the one marked
 * `aria-current` — in the middle of the row whenever it changes, so a tab or
 * a chip picked off-screen, or opened from a link, is never hidden. A row
 * that holds no more than it shows, as on a wide screen, is left alone.
 *
 * @param rowRef - The row
 * @param current - What the current item is: the row is scrolled when it changes
 * @example
 * ```tsx
 * const tabsRef = useRef<HTMLElement>(null);
 * useCurrentInView(tabsRef, pathname);
 * ```
 */
export function useCurrentInView(
  rowRef: React.RefObject<HTMLElement | null>,
  current: string | undefined,
): void {
  useLayoutEffect(() => {
    const row = rowRef.current;
    const item = current === undefined ? null : row?.querySelector<HTMLElement>("[aria-current]");
    if (!row || !item || row.scrollWidth <= row.clientWidth) return;
    const start = item.getBoundingClientRect().left - row.getBoundingClientRect().left;
    row.scrollLeft = centeredScroll(
      { start: start - row.clientLeft + row.scrollLeft, width: item.offsetWidth },
      { width: row.clientWidth, content: row.scrollWidth },
    );
  }, [rowRef, current]);
}
