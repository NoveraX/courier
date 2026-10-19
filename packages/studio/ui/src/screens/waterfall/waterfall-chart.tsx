import { useState } from "react";

import { relativeTime } from "@/features/waterfall/time-ticks";
import { cn } from "@/lib/utils";
import { RowMenu } from "@/request-list/row-menu";
import { useStudioStore } from "@/store";
import { GroupRow } from "./group-row";
import { mouseOnly } from "./mouse-only";
import { RequestBarRow } from "./request-bar-row";
import type { SegmentTip } from "./segment-tip";
import { SegmentTooltip } from "./segment-tooltip";
import { StreamBarRow } from "./stream-bar-row";
import { labelWidthIn } from "./track-layout";
import type { WaterfallModel } from "./use-waterfall";
import { WaterfallGrid, WaterfallRuler } from "./waterfall-ruler";

export interface WaterfallChartProps {
  /** Takes the chart's element, which the screen measures. */
  ref: React.Ref<HTMLElement>;
  model: WaterfallModel;
  /** The width the chart shows without scrolling. */
  visiblePx: number;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onToggle: (key: string) => void;
}

/**
 * The Waterfall's chart: a header with the time scale, then a row per
 * request and stream, scrolling both ways with the labels kept in place,
 * the time under a mouse marked, and each part of a bar named when a mouse
 * points at it — a finger's tap opens the request instead, and leaves
 * neither behind. On a chart too narrow for a column of labels, each row
 * names its request over its bar.
 *
 * @param props - The model, the visible width, the selection and what changes it
 * @returns The chart
 * @example
 * ```tsx
 * <WaterfallChart ref={ref} model={model} visiblePx={width} selectedId={req} onSelect={open} onToggle={toggle} />
 * ```
 */
export function WaterfallChart(props: WaterfallChartProps): React.ReactNode {
  const { ref, model, visiblePx, selectedId, onSelect, onToggle } = props;
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  const [cursorPx, setCursorPx] = useState<number | null>(null);
  const [tip, setTip] = useState<SegmentTip | null>(null);
  const { scale, labelPx, window } = model;
  const onMove = mouseOnly<HTMLElement>((e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = Math.round(e.clientX - box.left + e.currentTarget.scrollLeft - labelPx);
    setCursorPx(x >= 0 && x <= scale.trackPx ? x : null);
  });
  const layout = model.stacked ? "stacked" : "columns";
  const empty = model.rows.length === 0;
  const rowLabelPx = labelWidthIn(model.stacked, labelPx, visiblePx, scale.trackPx);
  const at = cursorPx === null ? null : scale.fromPx(cursorPx);
  const cursor =
    at === null || cursorPx === null
      ? null
      : { x: cursorPx, label: at.idle ? "idle" : relativeTime(at.t, window.start) };
  const lines = { ticks: model.ticks, gaps: model.gaps, labelPx, trackPx: scale.trackPx, cursor };
  return (
    <section
      ref={ref}
      aria-label="Waterfall"
      onPointerMove={onMove}
      onPointerLeave={() => {
        setCursorPx(null);
        setTip(null);
      }}
      className="relative min-h-0 flex-1 overflow-auto"
    >
      <div
        className={cn("relative min-w-full", empty && "flex min-h-full flex-col")}
        style={{ width: labelPx + scale.trackPx }}
      >
        <WaterfallRuler {...lines} />
        <WaterfallGrid {...lines} />
        <RowMenu>
          <div>
            {model.rows.map((row) =>
              row.kind === "group" ? (
                <GroupRow
                  key={row.key}
                  row={row}
                  width={Math.min(visiblePx, labelPx + scale.trackPx)}
                  onToggle={onToggle}
                />
              ) : row.kind === "stream" ? (
                <StreamBarRow
                  key={row.request.id}
                  request={row.request}
                  window={window}
                  scale={scale}
                  labelPx={rowLabelPx}
                  layout={layout}
                  now={model.now}
                  selected={row.request.id === selectedId}
                  onSelect={onSelect}
                />
              ) : (
                <RequestBarRow
                  key={row.item.request.id}
                  item={row.item}
                  indent={row.indent}
                  scale={scale}
                  labelPx={rowLabelPx}
                  layout={layout}
                  slowMs={slowMs}
                  selected={row.item.request.id === selectedId}
                  onSelect={onSelect}
                  onTip={setTip}
                />
              ),
            )}
          </div>
        </RowMenu>
        {empty && (
          <div
            style={{ width: Math.min(visiblePx, labelPx + scale.trackPx) }}
            className="sticky left-0 flex flex-1 flex-col items-center justify-center gap-2 px-5 py-18 text-center"
          >
            <span className="text-title font-semibold">
              {model.total ? "No requests in view" : "Waiting for requests"}
            </span>
            <span className="text-ui text-fg-muted">
              {model.total
                ? "Adjust the search or mode filter."
                : "Make API calls from your app to see them here as they happen."}
            </span>
          </div>
        )}
      </div>
      {tip && <SegmentTooltip tip={tip} />}
    </section>
  );
}
