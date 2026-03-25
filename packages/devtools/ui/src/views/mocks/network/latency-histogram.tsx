import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface LatencyHistogramProps {
  latencies: number[];
  p50: number;
  p95: number;
}

const BUCKETS = [
  { label: "<50ms", max: 50, color: "bg-emerald-400/70" },
  { label: "50–200", max: 200, color: "bg-emerald-400/40" },
  { label: "200–500", max: 500, color: "bg-amber-400/60" },
  { label: "500–1s", max: 1000, color: "bg-amber-400/80" },
  { label: ">1s", max: Infinity, color: "bg-rose-400/70" },
];

export function LatencyHistogram({ latencies, p50, p95 }: LatencyHistogramProps): React.ReactElement {
  const { buckets, maxCount } = useMemo(() => {
    const counts = BUCKETS.map((b, i) => {
      const min = i === 0 ? 0 : BUCKETS[i - 1]!.max;
      return { ...b, count: latencies.filter((v) => v >= min && v < b.max).length };
    });
    return { buckets: counts, maxCount: Math.max(...counts.map((b) => b.count), 1) };
  }, [latencies]);

  if (latencies.length === 0) {
    return <p className="py-6 text-center text-body-xs text-muted-foreground/40">No latency data yet</p>;
  }

  return (
    <div className="space-y-2">
      {/* Bar chart */}
      <div className="flex h-20 items-end gap-1.5">
        {buckets.map((b) => {
          const pct = (b.count / maxCount) * 100;
          const barH = b.count > 0 ? Math.max(pct, 5) : 0;
          return (
            <div key={b.label} className="group relative flex-1">
              <div className="flex h-20 items-end">
                <div
                  className={cn("w-full rounded-t-sm transition-all duration-500", b.color)}
                  style={{ height: `${barH}%` }}
                />
              </div>
              {/* Tooltip */}
              <div className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-popover px-1.5 py-0.5 text-[10px] text-foreground ring-1 ring-border-subtle group-hover:block">
                {b.count} reqs
              </div>
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div className="flex gap-1.5">
        {buckets.map((b) => (
          <div key={b.label} className="flex-1 text-center text-caption text-muted-foreground/40">
            {b.label}
          </div>
        ))}
      </div>

      {/* P50 / P95 legend */}
      {(p50 > 0 || p95 > 0) && (
        <div className="flex items-center gap-3 pt-1">
          <LegendItem color="text-accent-brand" label={`P50: ${Math.round(p50)}ms`} />
          <LegendItem color="text-amber-400" label={`P95: ${Math.round(p95)}ms`} />
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }): React.ReactElement {
  return (
    <div className="flex items-center gap-1">
      <span className={cn("text-[10px] font-medium tabular-nums", color)}>{label}</span>
    </div>
  );
}
