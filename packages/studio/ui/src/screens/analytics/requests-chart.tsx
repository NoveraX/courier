import type { RequestSeries } from "@/features/analytics/request-series";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { ChartPanel } from "./chart-panel";

function Legend(): React.ReactNode {
  return (
    <span className="flex items-center gap-2.5 text-badge text-fg-subtle">
      <span className="flex items-center gap-1.25">
        <span className="size-2 rounded-[2px] bg-brand" />
        ok
      </span>
      <span className="flex items-center gap-1.25">
        <span className="size-2 rounded-[2px] bg-err" />
        error
      </span>
    </span>
  );
}

interface RequestsChartProps {
  series: RequestSeries;
  /** How long the window is, ms. */
  span: number;
  /** Whether the window ends where a saved session ended, rather than now. */
  saved: boolean;
}

/**
 * Requests over time: thirty bars across the window, each its calls with
 * the failed ones on top, the newest bar — now, or a saved session's end —
 * in full colour.
 *
 * @param props - The bars, and the window's length
 * @returns The chart
 * @example
 * ```tsx
 * <RequestsChart series={requestSeries(win)} span={win.span} saved={false} />
 * ```
 */
export function RequestsChart({ series, span, saved }: RequestsChartProps): React.ReactNode {
  const { bars, max } = series;
  const total = bars.reduce((sum, bar) => sum + bar.ok + bar.failed, 0);
  const failed = bars.reduce((sum, bar) => sum + bar.failed, 0);
  return (
    <ChartPanel
      title="Requests over time"
      aside={<Legend />}
      summary={`${total} requests over ${formatDuration(span)}, ${failed} of them failed; at most ${max} in one stretch.`}
    >
      <div className="relative flex h-39 items-end gap-0.75 bg-[repeating-linear-gradient(0deg,var(--color-line)_0_1px,transparent_1px_39px)]">
        {bars.map((bar, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: a bar is a fixed stretch of the window
            key={i}
            title={`${bar.ok + bar.failed} req · ${bar.failed} err`}
            className="flex h-full min-w-0 flex-1 flex-col justify-end gap-px"
          >
            <span
              className="rounded-[2px] bg-err"
              style={{ height: `${(bar.failed / max) * 100}%` }}
            />
            <span
              className={cn(
                "rounded-[2px] transition-[height] duration-300 motion-reduce:transition-none",
                i === bars.length - 1
                  ? "bg-brand"
                  : "bg-[color-mix(in_srgb,var(--color-brand)_60%,transparent)]",
              )}
              style={{ height: `${(bar.ok / max) * 100}%` }}
            />
          </div>
        ))}
        <span className="absolute top-0.5 left-1 bg-panel px-0.75 font-mono text-micro text-fg-subtle">
          {max} max
        </span>
      </div>
      <div className="mt-2 flex justify-between font-mono text-micro text-fg-subtle">
        <span>−{formatDuration(span)}</span>
        <span>−{formatDuration(span / 2)}</span>
        <span>{saved ? "end" : "now"}</span>
      </div>
    </ChartPanel>
  );
}
