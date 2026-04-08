import { useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { GripVerticalIcon } from "lucide-react";

import { GROUP_HEADER_HEIGHT, MIN_BAR_HEIGHT, VIRTUAL_OVERSCAN } from "./constants";
import { msToPixels } from "./helpers";
import { SegmentTooltip } from "./segment-tooltip";
import { TimeRuler } from "./time-ruler";
import { LabelRow } from "./label-column";
import { useCanvasCursor } from "./use-canvas-cursor";
import { useLabelResize } from "./use-label-resize";
import { WaterfallBars } from "./waterfall-bars";
import { buildFlatItems } from "./virtual-helpers";

import type { GroupedRows, TimeGap, WaterfallRow, WaterfallSegment, ZoomState } from "./types";

const LABEL_DEFAULT_WIDTH = 280;

interface WaterfallCanvasProps {
  groups: GroupedRows[];
  rows: WaterfallRow[];
  gaps: TimeGap[];
  timeSpan: number;
  zoom: ZoomState;
  selectedId: string | null;
  showGroups: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onSelect: (id: string | null) => void;
  onWheelZoom: (deltaY: number, clientX: number, canvasLeft: number) => void;
}

interface TooltipState {
  segment: WaterfallSegment;
  row: WaterfallRow;
  x: number;
  y: number;
}

export function WaterfallCanvas({
  groups, rows, gaps, timeSpan, zoom,
  selectedId, showGroups, scrollRef,
  onSelect, onWheelZoom,
}: WaterfallCanvasProps): React.ReactElement {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [labelWidth, setLabelWidth] = useState(LABEL_DEFAULT_WIDTH);
  const draggingRef = useRef(false);

  const totalWidth = msToPixels(timeSpan, zoom.scale) + 100;
  const pxPerMs = zoom.scale / 2;

  const { cursorX, setCursorX, handleMouseMove, handleMouseLeave } = useCanvasCursor({
    scrollRef, draggingRef, labelWidth, onWheelZoom,
  });

  const onResizeStart = useCallback(() => {
    setCursorX(null);
    setTooltip(null);
  }, [setCursorX]);

  const { cornerRef, labelColRef, handleRef, handleDragStart } = useLabelResize({
    scrollRef, draggingRef, labelWidth, setLabelWidth, onDragStart: onResizeStart,
  });

  const flatItems = useMemo(
    () => buildFlatItems(groups, rows, showGroups, collapsedGroups),
    [groups, rows, showGroups, collapsedGroups],
  );

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => flatItems[i]!.type === "group-header" ? GROUP_HEADER_HEIGHT : MIN_BAR_HEIGHT,
    overscan: VIRTUAL_OVERSCAN,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const contentHeight = virtualizer.getTotalSize();

  const handleSegmentHover = useCallback(
    (seg: WaterfallSegment | null, row: WaterfallRow, x: number, y: number) => {
      setTooltip(seg ? { segment: seg, row, x, y } : null);
    },
    [],
  );

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={handleRef}
        className="group absolute inset-y-0 z-30 w-3 cursor-col-resize"
        style={{ left: labelWidth - 6 }}
        onMouseDown={handleDragStart}
        onMouseMove={(e) => { e.stopPropagation(); setCursorX(null); }}
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-accent-brand group-active:bg-accent-brand" />
        <div className="absolute left-1/2 top-1/2 z-10 flex h-4 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xs border bg-border">
          <GripVerticalIcon className="size-2.5" />
        </div>
      </div>

      <div
        ref={scrollRef}
        className="h-full overflow-auto"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div className="sticky top-0 z-20 flex">
          <div ref={cornerRef} className="sticky left-0 z-30 shrink-0 border-b border-r border-border-subtle bg-background" style={{ width: labelWidth }} />
          <TimeRuler timeSpan={timeSpan} zoom={zoom} cursorX={cursorX} totalWidth={totalWidth} gaps={gaps} />
        </div>

        <div className="flex" style={{ height: contentHeight }}>
          <div ref={labelColRef} className="sticky left-0 z-10 shrink-0 border-r border-border-subtle bg-background" style={{ width: labelWidth }}>
            {virtualItems.map((vi) => (
              <LabelRow
                key={vi.key}
                item={flatItems[vi.index]!}
                top={vi.start}
                height={vi.size}
                selectedId={selectedId}
                onSelect={onSelect}
                onToggleGroup={toggleGroup}
              />
            ))}
          </div>

          <WaterfallBars
            flatItems={flatItems}
            virtualItems={virtualItems}
            totalWidth={totalWidth}
            pxPerMs={pxPerMs}
            timeSpan={timeSpan}
            zoom={zoom}
            gaps={gaps}
            cursorX={cursorX}
            selectedId={selectedId}
            onSelect={onSelect}
            onSegmentHover={handleSegmentHover}
          />
        </div>
      </div>

      {tooltip && (
        <SegmentTooltip segment={tooltip.segment} row={tooltip.row} x={tooltip.x} y={tooltip.y} />
      )}
    </div>
  );
}
