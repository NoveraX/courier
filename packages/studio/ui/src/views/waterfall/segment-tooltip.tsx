import { formatDuration, formatPercent } from "@/components/shared/formatters";
import { MethodBadge } from "@/components/shared/method-badge";
import { Badge } from "@/components/ui/badge";
import { SEGMENT_CONFIG } from "./constants";
import type { WaterfallRow, WaterfallSegment } from "./types";

interface SegmentTooltipProps {
  segment: WaterfallSegment;
  row: WaterfallRow;
  x: number;
  y: number;
}

export function SegmentTooltip({ segment, row, x, y }: SegmentTooltipProps): React.ReactElement {
  const config = SEGMENT_CONFIG[segment.key];

  return (
    <div
      className="pointer-events-none fixed z-50 min-w-40 max-w-65 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-xl"
      style={{
        left: Math.min(x, window.innerWidth - 240),
        top: y - 12,
        transform: "translate(-50%, -100%)",
      }}
    >
      {/* Segment name + duration */}
      <div className="flex items-center gap-2">
        <div className={`size-2 rounded-full ${config.bg}`} />
        <span className="text-xs font-medium">{config.label}</span>
        <span className="ml-auto mono-sm tabular-nums">{formatDuration(segment.duration)}</span>
      </div>

      {/* Percentage */}
      <div className="mt-1 text-caption text-muted-foreground">
        {formatPercent(segment.duration, row.totalDuration)} of total
      </div>

      {/* Proxy hop context */}
      {row.isProxy && <ProxyHopContext segmentKey={segment.key} />}

      {/* Request meta */}
      <div className="mt-2 flex items-center gap-1.5 border-t border-border-subtle pt-2">
        <MethodBadge method={row.request.httpMethod ?? "GET"} />
        <span className="truncate mono-xs text-muted-foreground">
          {row.request.source}.{row.request.group}.{row.request.method}
        </span>
        <Badge
          variant={
            row.request.status === "success"
              ? "emerald"
              : row.request.status === "error"
                ? "rose"
                : "secondary"
          }
          className="ml-auto shrink-0 text-[9px]"
        >
          {row.request.status}
        </Badge>
      </div>
    </div>
  );
}

// ── Proxy hop context label ──────────────────────────────────────────────

const HOP_MAP: Record<string, string> = {
  "client-to-proxy": "Client → Proxy",
  "middleware-req": "Proxy (server)",
  fetch: "Proxy → Backend → Proxy",
  validation: "Proxy (server)",
  "middleware-res": "Proxy (server)",
  "proxy-to-client": "Proxy → Client",
};

function ProxyHopContext({ segmentKey }: { segmentKey: string }): React.ReactElement {
  const hop = HOP_MAP[segmentKey] ?? "";
  return <div className="mt-1 text-caption text-muted-foreground/60">{hop}</div>;
}
