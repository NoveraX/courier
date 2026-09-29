import { memo } from "react";

import { formatDuration } from "@/components/shared/formatters";
import { MethodBadge } from "@/components/shared/method-badge";
import { Badge } from "@/components/ui/badge";
import { buttonProps } from "@/lib/button-props";
import { cn } from "@/lib/utils";
import { MIN_BAR_HEIGHT } from "./constants";
import { SegmentBar } from "./segment-bar";
import type { WaterfallRow, WaterfallSegment } from "./types";

interface WaterfallRowProps {
  row: WaterfallRow;
  pxPerMs: number;
  isSelected: boolean;
  index: number;
  onSelect: (id: string | null) => void;
  onSegmentHover: (
    segment: WaterfallSegment | null,
    row: WaterfallRow,
    x: number,
    y: number,
  ) => void;
}

export const WaterfallRowItem = memo(function WaterfallRowItem({
  row,
  pxPerMs,
  isSelected,
  index,
  onSelect,
  onSegmentHover,
}: WaterfallRowProps): React.ReactElement {
  const offsetPx = row.offsetMs * pxPerMs;

  return (
    <div
      className={cn(
        "group relative flex items-center cursor-pointer transition-colors",
        "hover:bg-muted/30",
        index % 2 === 1 && "bg-muted/10",
        isSelected && "bg-accent-brand/5 ring-1 ring-inset ring-accent-brand/20",
      )}
      style={{ height: MIN_BAR_HEIGHT }}
      {...buttonProps(() => onSelect(row.request.id))}
    >
      <SegmentBar
        segments={row.segments}
        row={row}
        offsetPx={offsetPx}
        pxPerMs={pxPerMs}
        onSegmentHover={onSegmentHover}
      />
    </div>
  );
});

// ── Row label (rendered in label column) ──────────────────────────────────

interface RowLabelProps {
  row: WaterfallRow;
  index: number;
  onSelect: (id: string | null) => void;
  isSelected: boolean;
}

export const RowLabel = memo(function RowLabel({
  row,
  index,
  onSelect,
  isSelected,
}: RowLabelProps): React.ReactElement {
  const fullPath = [row.request.source, row.request.group, row.request.method]
    .filter(Boolean)
    .join(".");

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 h-8 cursor-pointer transition-colors",
        "hover:bg-muted/30",
        index % 2 === 1 && "bg-muted/10",
        row.isProxy && "border-l-2 border-indigo-500/60",
        isSelected && "bg-accent-brand/5",
      )}
      {...buttonProps(() => onSelect(row.request.id))}
    >
      {/* Status dot */}
      <div
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          row.request.status === "success" && "bg-emerald-500",
          row.request.status === "error" && "bg-rose-500",
          row.request.status === "validation_error" && "bg-amber-500",
          row.request.status === "pending" && "bg-sky-500 animate-pulse",
          row.request.status === "aborted" && "bg-muted-foreground",
        )}
      />

      <MethodBadge method={row.request.httpMethod ?? "GET"} className="shrink-0" />

      <span
        className="min-w-0 flex items-baseline gap-0.5 mono-md overflow-hidden"
        title={fullPath}
      >
        {row.request.group && (
          <span className="shrink text-muted-foreground/60 truncate">{row.request.group}.</span>
        )}
        <span className="shrink-0 text-foreground/80">{row.request.method}</span>
      </span>

      {row.isProxy && (
        <Badge variant="indigo" className="shrink-0 text-[8px] px-1 py-0 leading-3">
          PROXY
        </Badge>
      )}

      <span className="ml-auto shrink-0 mono-md text-muted-foreground tabular-nums">
        {formatDuration(row.totalDuration)}
      </span>
    </div>
  );
});
