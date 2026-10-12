import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** An element's width and height, in CSS pixels. */
export interface ElementSize {
  width: number;
  height: number;
}

interface Watched {
  element: HTMLElement;
  observer: ResizeObserver;
}

const UNMEASURED: ElementSize = { width: 0, height: 0 };

/**
 * The size of an element, kept current as it resizes: measured as soon as
 * the element exists, before it is painted, and followed if it is replaced.
 * Both sides are 0 until then.
 *
 * @param ref - The element
 * @returns Its width and height, in CSS pixels
 * @example
 * ```ts
 * const { width, height } = useElementSize(paneRef);
 * ```
 */
export function useElementSize(ref: React.RefObject<HTMLElement | null>): ElementSize {
  const [size, setSize] = useState<ElementSize>(UNMEASURED);
  const watched = useRef<Watched | null>(null);
  /* After every render, as the element the ref holds may only now exist. */
  useLayoutEffect(() => {
    const element = ref.current;
    if (watched.current?.element === element) return;
    watched.current?.observer.disconnect();
    watched.current = null;
    if (!element) return;
    setSize({ width: element.clientWidth, height: element.clientHeight });
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      setSize((last) =>
        last.width === width && last.height === height ? last : { width, height },
      );
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
  return size;
}
