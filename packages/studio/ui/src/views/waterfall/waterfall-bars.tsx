/**
 * Bars area for the waterfall canvas — virtualized rows + overlays.
 *
 * Renders grid lines, time gaps, the cursor scrubber, and the per-row
 * segment bars based on the virtualizer items the parent computes.
 */

import type { VirtualItem } from "@tanstack/react-virtual";
import { GapIndicator } from "./gap-indicator";
import { GridLines } from "./grid-lines";
import type { FlatItem, TimeGap, WaterfallRow, WaterfallSegment, ZoomState } from "./types";
import { WaterfallRowItem } from "./waterfall-row";

interface WaterfallBarsProps {
  flatItems: FlatItem[];
  virtualItems: VirtualItem[];
  totalWidth: number;
  pxPerMs: number;
  timeSpan: number;
  zoom: ZoomState;
  gaps: TimeGap[];
  cursorX: number | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onSegmentHover: (seg: WaterfallSegment | null, row: WaterfallRow, x: number, y: number) => void;
}

export function WaterfallBars({
  flatItems,
  virtualItems,
  totalWidth,
  pxPerMs,
  timeSpan,
  zoom,
  gaps,
  cursorX,
  selectedId,
  onSelect,
  onSegmentHover,
}: WaterfallBarsProps): React.ReactElement {
  return (
    <div className="relative" style={{ width: totalWidth }}>
      <GridLines timeSpan={timeSpan} zoom={zoom} />
      {gaps.map((gap, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the gaps between requests, in time order; a gap's place is its identity
        <GapIndicator key={i} gap={gap} zoom={zoom} />
      ))}

      {cursorX !== null && (
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-accent-brand/40"
          style={{ left: cursorX }}
        />
      )}

      {virtualItems.map((vi) => {
        const item = flatItems[vi.index];
        if (!item) return null;
        if (item.type === "group-header") {
          return <div key={vi.key} className="absolute inset-x-0 h-8" style={{ top: vi.start }} />;
        }
        return (
          <div
            key={vi.key}
            className="absolute inset-x-0"
            style={{ top: vi.start, height: vi.size }}
          >
            <WaterfallRowItem
              row={item.row}
              index={item.rowIndex}
              pxPerMs={pxPerMs}
              isSelected={item.row.request.id === selectedId}
              onSelect={onSelect}
              onSegmentHover={onSegmentHover}
            />
          </div>
        );
      })}
    </div>
  );
}
