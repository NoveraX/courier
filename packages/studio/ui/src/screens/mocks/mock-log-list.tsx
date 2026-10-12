import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";

import { listTierOf, MEDIA, STACKED_BELOW } from "@/design/breakpoints";
import { useElementWidth } from "@/hooks/use-element-width";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { MockRequestLog } from "@/store/mock-slice";
import { logRowHeight } from "./log-row-height";
import { MockLogRow } from "./mock-log-row";

interface MockLogListProps {
  logs: readonly MockRequestLog[];
  /** The request open in the sheet, if any. */
  selected: string | undefined;
  slowMs: number;
  onOpen: (id: string) => void;
}

/**
 * A mock's logged requests, newest first, scrolling on their own: only the
 * rows in view, and a few either side, are drawn, however long the log. In
 * a list too narrow for the columns each request takes two lines.
 *
 * @param props - The requests, the one open, the slow threshold, and what opens one
 * @returns The list
 * @example
 * ```tsx
 * <MockLogList logs={shown} selected={sheet.requestId} slowMs={500} onOpen={sheet.open} />
 * ```
 */
export function MockLogList({ logs, selected, slowMs, onOpen }: MockLogListProps): React.ReactNode {
  const scrollRef = useRef<HTMLElement>(null);
  /* Until the list is measured the window's width stands in for it, so a phone never draws the columns first. */
  const width = useElementWidth(scrollRef, typeof window === "undefined" ? 0 : window.innerWidth);
  /* The rows have one layout of columns, from where they stop stacking. */
  const stacked = listTierOf(width, STACKED_BELOW) === "stacked";
  const rowHeight = logRowHeight(stacked, useMediaQuery(MEDIA.coarse));
  const virtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => scrollRef.current,
    /* Every row is as high as the others, so the list knows where each one sits without measuring it. */
    estimateSize: () => rowHeight,
    getItemKey: (index) => logs[index]?.id ?? index,
    overscan: 12,
    /* Rows to draw before the list is first measured: a window's worth. */
    initialRect: { width: 0, height: typeof window === "undefined" ? 0 : window.innerHeight },
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: the virtualizer keeps the places it worked out; rows of another height ask it again
  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, rowHeight]);
  return (
    <section ref={scrollRef} aria-label="Requests" className="min-h-0 flex-1 overflow-auto">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtual) => {
          const log = logs[virtual.index];
          if (!log) return null;
          return (
            <div
              key={virtual.key}
              className="absolute inset-x-0"
              style={{ top: virtual.start, height: rowHeight }}
            >
              <MockLogRow
                log={log}
                selected={selected === log.id}
                stacked={stacked}
                slowMs={slowMs}
                onOpen={() => onOpen(log.id)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
