import { latencyBars } from "@/features/explorer/endpoint-detail";
import type { EndpointNode } from "@/features/explorer/explorer-model";
import { formatAbsoluteTime, formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface EndpointLatencyProps {
  endpoint: EndpointNode;
  slowMs: number;
}

/**
 * An endpoint's latency chart: a bar per recent finished call, oldest
 * first, red where it failed and amber past the slow threshold, with its
 * median and the longest shown.
 *
 * @param props - The endpoint and the slow threshold
 * @returns The chart
 * @example
 * ```tsx
 * <EndpointLatency endpoint={endpoint} slowMs={500} />
 * ```
 */
export function EndpointLatency({ endpoint, slowMs }: EndpointLatencyProps): React.ReactNode {
  const bars = latencyBars(endpoint);
  const longest = Math.max(0, ...bars.map((b) => b.duration));
  const { p50 } = endpoint.metrics;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-2">
        <h3 className="text-label font-semibold text-fg-muted">Latency</h3>
        <span className="text-label text-fg-subtle">
          last {bars.length} {bars.length === 1 ? "call" : "calls"}
        </span>
        <div className="flex-1" />
        {bars.length > 0 && p50 !== null && (
          <span className="font-mono text-badge text-fg-subtle">
            p50 {formatDuration(p50)} · max {formatDuration(longest)}
          </span>
        )}
      </div>
      <div className="flex h-16 items-end gap-0.75 rounded-panel border border-line bg-inset p-2">
        {bars.length === 0 && (
          <span className="m-auto text-label text-fg-subtle">No finished HTTP calls yet</span>
        )}
        {bars.map((bar) => (
          <span
            key={bar.request.id}
            title={`${formatDuration(bar.duration)} · ${formatAbsoluteTime(bar.request.startedAt)}`}
            style={{ height: `${bar.share * 100}%` }}
            className={cn(
              "min-h-0.5 flex-1 rounded-[2px]",
              bar.failed ? "bg-err" : bar.duration > slowMs ? "bg-warn" : "bg-brand/70",
            )}
          />
        ))}
      </div>
    </div>
  );
}
