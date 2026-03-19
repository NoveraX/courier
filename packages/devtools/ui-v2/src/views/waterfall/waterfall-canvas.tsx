import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { GripVerticalIcon } from "lucide-react";

import { MIN_BAR_HEIGHT, VIRTUAL_OVERSCAN, GROUP_HEADER_HEIGHT } from "./constants";
import { GapIndicator } from "./gap-indicator";
import { GridLines } from "./grid-lines";
import { msToPixels } from "./helpers";
import { SegmentTooltip } from "./segment-tooltip";
import { TimeRuler } from "./time-ruler";
import type { GroupedRows, TimeGap, WaterfallRow, WaterfallSegment, ZoomState } from "./types";
import { buildFlatItems } from "./virtual-helpers";
import { LabelRow } from "./label-column";
import { WaterfallRowItem } from "./waterfall-row";

const LABEL_DEFAULT_WIDTH = 280;
const LABEL_MIN_WIDTH = 180;
const LABEL_MAX_WIDTH = 500;

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
  const [cursorX, setCursorX] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [labelWidth, setLabelWidth] = useState(LABEL_DEFAULT_WIDTH);

  const rafRef = useRef(0);
  const draggingRef = useRef(false);
  const cornerRef = useRef<HTMLDivElement>(null);
  const labelColRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const totalWidth = msToPixels(timeSpan, zoom.scale) + 100;
  const pxPerMs = zoom.scale / 2;

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

  // Native wheel listener (non-passive) to prevent browser zoom on pinch
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      onWheelZoom(e.deltaY, e.clientX, rect.left);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheelZoom]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (draggingRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left + el.scrollLeft - labelWidth;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setCursorX(x);
      rafRef.current = 0;
    });
  }, [labelWidth]);

  const handleMouseLeave = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setCursorX(null);
  }, []);

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

  // Label column resize via drag
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    setCursorX(null);
    setTooltip(null);
    const startX = e.clientX;
    const startW = labelWidth;

    // Disable pointer events on scroll container during drag to prevent tooltip flicker
    if (scrollRef.current) scrollRef.current.style.pointerEvents = "none";

    let dragRaf = 0;
    const onMove = (ev: MouseEvent): void => {
      if (dragRaf) return;
      dragRaf = requestAnimationFrame(() => {
        const w = Math.min(LABEL_MAX_WIDTH, Math.max(LABEL_MIN_WIDTH, startW + ev.clientX - startX));
        if (cornerRef.current) cornerRef.current.style.width = `${w}px`;
        if (labelColRef.current) labelColRef.current.style.width = `${w}px`;
        if (handleRef.current) handleRef.current.style.left = `${w - 6}px`;
        dragRaf = 0;
      });
    };
    const onUp = (): void => {
      draggingRef.current = false;
      if (scrollRef.current) scrollRef.current.style.pointerEvents = "";
      const finalW = labelColRef.current ? parseFloat(labelColRef.current.style.width) : startW;
      setLabelWidth(finalW);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [labelWidth]);

  return (
    <div className="relative flex-1 overflow-hidden">
      {/* Resize handle — outside scroll, always centered vertically */}
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
        {/* Sticky header row: corner + ruler */}
        <div className="sticky top-0 z-20 flex">
          <div ref={cornerRef} className="sticky left-0 z-30 shrink-0 border-b border-r border-border-subtle bg-background" style={{ width: labelWidth }} />
          <TimeRuler timeSpan={timeSpan} zoom={zoom} cursorX={cursorX} totalWidth={totalWidth} gaps={gaps} />
        </div>

        {/* Content: labels (sticky left) + bars */}
        <div className="flex" style={{ height: contentHeight }}>
          {/* Label column — sticky left, scrolls vertically with bars */}
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

          {/* Bars area */}
          <div className="relative" style={{ width: totalWidth }}>
            <GridLines timeSpan={timeSpan} zoom={zoom} />
            {gaps.map((gap, i) => (
              <GapIndicator key={i} gap={gap} zoom={zoom} />
            ))}

            {cursorX !== null && (
              <div className="pointer-events-none absolute inset-y-0 w-px bg-accent-brand/40" style={{ left: cursorX }} />
            )}

            {virtualItems.map((vi) => {
              const item = flatItems[vi.index]!;
              if (item.type === "group-header") {
                return <div key={vi.key} className="absolute inset-x-0 h-8" style={{ top: vi.start }} />;
              }
              return (
                <div key={vi.key} className="absolute inset-x-0" style={{ top: vi.start, height: vi.size }}>
                  <WaterfallRowItem
                    row={item.row!}
                    index={item.rowIndex}
                    pxPerMs={pxPerMs}
                    isSelected={item.row!.request.id === selectedId}
                    onSelect={onSelect}
                    onSegmentHover={handleSegmentHover}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {tooltip && (
        <SegmentTooltip segment={tooltip.segment} row={tooltip.row} x={tooltip.x} y={tooltip.y} />
      )}
    </div>
  );
}
