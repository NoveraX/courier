import { formatDuration } from "@/components/shared/formatters";
import { cn } from "@/lib/utils";
import { SEGMENT_CONFIG } from "./constants";
import type { WaterfallRow, WaterfallSegment } from "./types";

interface SegmentBarProps {
  segments: WaterfallSegment[];
  row: WaterfallRow;
  offsetPx: number;
  pxPerMs: number;
  onSegmentHover: (
    segment: WaterfallSegment | null,
    row: WaterfallRow,
    x: number,
    y: number,
  ) => void;
}

export function SegmentBar({
  segments,
  row,
  offsetPx,
  pxPerMs,
  onSegmentHover,
}: SegmentBarProps): React.ReactElement {
  return (
    <div className="absolute inset-y-1 flex items-center" style={{ left: offsetPx }}>
      {segments.map((seg, i) => {
        const config = SEGMENT_CONFIG[seg.key];
        const widthPx = Math.max(seg.duration * pxPerMs, 2);
        const leftPx = seg.start * pxPerMs;

        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: the phases of one request, in order
            key={`${i}-${seg.key}`}
            className={cn(
              "absolute inset-y-0 h-full rounded-sm opacity-80 transition-opacity hover:opacity-100",
              config.bg,
            )}
            style={{ left: leftPx, width: widthPx }}
            role="img"
            aria-label={`${config.label}: ${formatDuration(seg.duration)}`}
            onMouseMove={(e) => onSegmentHover(seg, row, e.clientX, e.clientY)}
            onMouseLeave={() => onSegmentHover(null, row, 0, 0)}
          />
        );
      })}
    </div>
  );
}
