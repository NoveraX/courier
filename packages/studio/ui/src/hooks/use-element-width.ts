import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface Watched {
  element: HTMLElement;
  observer: ResizeObserver;
}

/**
 * The width of an element, kept current as it resizes. The element may
 * appear after the first render — a list drawn once its data arrives, in
 * place of a skeleton — and is measured as soon as it does, before it is
 * painted; one that is replaced is followed in its stead.
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
  const watched = useRef<Watched | null>(null);
  /* After every render, as the element the ref holds may only now exist. */
  useLayoutEffect(() => {
    const element = ref.current;
    if (watched.current?.element === element) return;
    watched.current?.observer.disconnect();
    watched.current = null;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    watched.current = { element, observer };
  });
  useEffect(
    () => () => {
      watched.current?.observer.disconnect();
      watched.current = null;
    },
    [],
  );
  return width;
}
