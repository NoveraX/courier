import { useEffect, useState } from "react";

/**
 * The width of an element, kept current as it resizes.
 *
 * @param ref - The element
 * @param initial - The width assumed until it is measured
 * @returns The width, in CSS pixels
 * @example
 * ```ts
 * const width = useElementWidth(listRef, 1200);
 * ```
 */
export function useElementWidth(ref: React.RefObject<HTMLElement | null>, initial: number): number {
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
