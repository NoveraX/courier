import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useRef } from "react";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { useStudioStore } from "@/store";

import type { RequestEntry } from "@/store/types";

import { OVERSCAN, ROW_HEIGHTS } from "./constants";
import { RequestContextMenu } from "./context-menu";
import { PinnedSection } from "./pinned-section";
import { RequestRow } from "./request-row";

interface RequestListProps {
  requests: RequestEntry[];
  pinnedRequests: RequestEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function RequestList({
  requests,
  pinnedRequests,
  selectedId,
  onSelect,
}: RequestListProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const density = useStudioStore((s) => s.settings.density);
  const rowHeight = ROW_HEIGHTS[density];

  const virtualizer = useVirtualizer({
    count: requests.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: OVERSCAN,
  });

  useAutoScroll(scrollRef, requests.length, shouldAutoScroll);

  const handleKeyDown = useKeyboardNavById(requests, selectedId, onSelect);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="listbox"
      aria-label="Request list"
    >
      <PinnedSection requests={pinnedRequests} selectedId={selectedId} onSelect={onSelect} />

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const request = requests[vi.index];
            if (!request) return null;
            return (
              <div
                key={request.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: vi.size,
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                <RequestContextMenu request={request}>
                  <RequestRow
                    request={request}
                    selected={selectedId === request.id}
                    onSelect={onSelect}
                  />
                </RequestContextMenu>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Keyboard nav that calls onSelect with the id string (timeline-specific) */
function useKeyboardNavById(
  requests: RequestEntry[],
  selectedId: string | null,
  onSelect: (id: string) => void,
): (e: React.KeyboardEvent) => void {
  return useCallback(
    (e: React.KeyboardEvent) => {
      if (requests.length === 0) return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

      e.preventDefault();
      const idx = selectedId ? requests.findIndex((r) => r.id === selectedId) : -1;
      const next =
        e.key === "ArrowDown" ? Math.min(idx + 1, requests.length - 1) : Math.max(idx - 1, 0);

      const request = requests[next];
      if (request) onSelect(request.id);
    },
    [requests, selectedId, onSelect],
  );
}
