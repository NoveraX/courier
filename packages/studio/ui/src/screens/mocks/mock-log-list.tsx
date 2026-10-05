import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

import type { MockRequestLog } from "@/store/mock-slice";
import { MockLogRow } from "./mock-log-row";

/* Every row is one line high, so the list knows where each one sits without measuring it. */
const ROW_HEIGHT = 34;

interface MockLogListProps {
  logs: readonly MockRequestLog[];
  /** The request open in the sheet, if any. */
  selected: string | undefined;
  slowMs: number;
  onOpen: (id: string) => void;
}

/**
 * A mock's logged requests, newest first, scrolling on their own: only the
 * rows in view, and a few either side, are drawn, however long the log.
 *
 * @param props - The requests, the one open, the slow threshold, and what opens one
 * @returns The list
 * @example
 * ```tsx
 * <MockLogList logs={shown} selected={sheet.requestId} slowMs={500} onOpen={sheet.open} />
 * ```
 */
export function MockLogList({ logs, selected, slowMs, onOpen }: MockLogListProps): React.ReactNode {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => logs[index]?.id ?? index,
    overscan: 12,
    /* Rows to draw before the list is first measured: a window's worth. */
    initialRect: { width: 0, height: typeof window === "undefined" ? 0 : window.innerHeight },
  });
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
              style={{ top: virtual.start, height: ROW_HEIGHT }}
            >
              <MockLogRow
                log={log}
                selected={selected === log.id}
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
