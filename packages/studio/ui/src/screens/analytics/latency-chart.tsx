import { durationLabel } from "@/features/analytics/duration-label";
import type { LatencyBin, LatencyBins } from "@/features/analytics/latency-bins";
import { cn } from "@/lib/utils";
import { ChartPanel } from "./chart-panel";

const BAR_FILL: Readonly<Record<LatencyBin["tone"], string>> = {
  brand: "bg-brand",
  warn: "bg-warn",
  err: "bg-err",
};

/* The tallest bar fills this share of the plot, leaving room above it for its count and tags. */
const TALLEST = 0.72;

function tipOf(bin: LatencyBin): string {
  const failed = bin.failed > 0 ? `, ${bin.failed} failed` : "";
  return `${bin.range} · ${bin.count} requests${failed}`;
}

function summaryOf({ bins, p50, p95 }: LatencyBins): string {
  const spread = bins.map((bin) => `${bin.range}: ${bin.count}`).join(", ");
  return `Response times. ${spread}. Median ${durationLabel(p50)}, p95 ${durationLabel(p95)}.`;
}

/**
 * How response times spread: a bar a bin, the calls that failed on top in
 * red, the median's and the p95's bins tagged, bars past the slow
 * threshold coloured as warnings and past twice it as errors.
 *
 * @param props - The distribution
 * @returns The chart
 * @example
 * ```tsx
 * <LatencyChart latency={latencyBins(win.done, 500)} />
 * ```
 */
export function LatencyChart({ latency }: { latency: LatencyBins }): React.ReactNode {
  const { bins, p50, p95 } = latency;
  const tallest = Math.max(1, ...bins.map((bin) => bin.count));
  return (
    <ChartPanel
      title="Response time"
      note="distribution"
      summary={summaryOf(latency)}
      aside={
        <span className="font-mono text-badge whitespace-nowrap text-fg-subtle">
          p50 {durationLabel(p50)} · p95 {durationLabel(p95)}
        </span>
      }
    >
      <div className="flex h-39 items-end gap-1.5">
        {bins.map((bin) => (
          <div
            key={bin.label}
            title={tipOf(bin)}
            className="flex h-full min-w-0 flex-1 flex-col items-stretch justify-end gap-1.25"
          >
            {bin.tags.length > 0 && (
              <span className="flex h-4.25 items-center self-center rounded-chip bg-brand-dim px-1.25 font-mono text-micro font-semibold whitespace-nowrap text-brand">
                {bin.tags.join(" · ")}
              </span>
            )}
            <span className="self-center font-mono text-meta text-fg-subtle">
              {bin.count || ""}
            </span>
            <div
              className="flex min-h-0.5 flex-col overflow-hidden rounded-t-[4px] rounded-b-[2px]"
              style={{ height: `${(bin.count / tallest) * TALLEST * 100}%` }}
            >
              <span
                className="bg-err"
                style={{ height: bin.count ? `${(bin.failed / bin.count) * 100}%` : "0%" }}
              />
              <span className={cn("flex-1", BAR_FILL[bin.tone])} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        {bins.map((bin) => (
          <span
            key={bin.label}
            className="min-w-0 flex-1 text-center font-mono text-micro whitespace-nowrap text-fg-subtle"
          >
            {bin.label}
          </span>
        ))}
      </div>
    </ChartPanel>
  );
}
