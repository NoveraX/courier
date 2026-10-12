import { useLayoutEffect, useState } from "react";

/**
 * The width of the Waterfall's chart, kept current as it resizes. The chart
 * is drawn only once Studio has sent the requests, after the screen around
 * it — so the element is kept when it arrives and measured from then on,
 * before it is first shown; a ref read when the screen first draws would
 * find nothing there, and never look again.
 *
 * @param initial - The width assumed until the chart is measured
 * @returns The width, and the ref to give the chart's element
 * @example
 * ```tsx
 * const [width, chartRef] = useChartWidth(1180);
 * <WaterfallChart ref={chartRef} model={model} visiblePx={width} … />
 * ```
 */
export function useChartWidth(initial: number): [number, (element: HTMLElement | null) => void] {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(initial);
  useLayoutEffect(() => {
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [width, setElement];
}
