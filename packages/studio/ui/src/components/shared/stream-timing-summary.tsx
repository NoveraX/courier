import { formatDuration, formatSize } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { DetailRow as Row, DetailSection as Section } from "./detail-panel/detail-rows";

interface StreamTimingData {
  duration?: number | undefined;
  eventCount?: number | undefined;
  totalBytes?: number | undefined;
  transport?: string | undefined;
}

/** Stream timing summary — reused in detail panel and playground */
export function StreamTimingSummary({ data }: { data: StreamTimingData }): React.ReactElement {
  return (
    <Section title="Stream Timing">
      <Row label="Duration">
        {data.duration != null ? (
          <span className={cn("mono-sm font-medium tabular-nums", durationColor(data.duration))}>
            {formatDuration(data.duration)}
          </span>
        ) : (
          "—"
        )}
      </Row>
      <Row label="Events">
        <span className="mono-sm tabular-nums">{data.eventCount || "—"}</span>
      </Row>
      <Row label="Total Size">
        <span className="mono-sm tabular-nums">
          {data.totalBytes ? formatSize(data.totalBytes) : "—"}
        </span>
      </Row>
      <Row label="Transport">
        <span className="mono-sm font-medium uppercase tracking-wider">
          {data.transport?.toUpperCase() ?? "—"}
        </span>
      </Row>
    </Section>
  );
}

function durationColor(ms: number): string {
  if (ms > 60_000) return "text-rose-400";
  if (ms > 10_000) return "text-amber-400";
  return "text-emerald-400";
}
