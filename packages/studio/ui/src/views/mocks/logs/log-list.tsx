import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { useKeyboardNav } from "@/hooks/use-keyboard-nav";
import { useStudioStore } from "@/store";

import type { MockRequestLog } from "@/store/mock-slice";

import { LogRow } from "./log-row";

const ROW_HEIGHTS = { comfortable: 36, compact: 28 } as const;
const OVERSCAN = 15;

interface LogListProps {
  logs: MockRequestLog[];
  selectedId: string | null;
  onSelect: (log: MockRequestLog) => void;
}

export function LogList({ logs, selectedId, onSelect }: LogListProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const density = useStudioStore((s) => s.settings.density);
  const rowHeight = ROW_HEIGHTS[density];

  const virtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: OVERSCAN,
  });

  useAutoScroll(scrollRef, logs.length, shouldAutoScroll);

  const handleKeyDown = useKeyboardNav(logs, selectedId, onSelect);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="listbox"
      aria-label="Log list"
    >
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const log = logs[vi.index]!;
            return (
              <div
                key={log.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: vi.size,
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                <LogRow log={log} selected={selectedId === log.id} onSelect={onSelect} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
