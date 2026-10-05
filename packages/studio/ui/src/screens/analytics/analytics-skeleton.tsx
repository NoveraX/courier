import { LoadingRegion } from "@/design/loading-region";
import { Skeleton } from "@/design/skeleton";

const KPIS = ["requests", "latency", "p95", "errors", "success", "endpoints"] as const;
const CHARTS = ["latency", "status", "requests"] as const;
/* A chart's bars rise and fall; the placeholder's do too, so it reads as a chart. */
const BARS = Array.from({ length: 24 }, (_, i) => ({
  id: `bar-${i}`,
  height: `${22 + ((i * 37) % 70)}%`,
}));
const ROWS = ["first", "second", "third", "fourth", "fifth"] as const;

function ChartSkeleton(): React.ReactNode {
  return (
    <div className="flex min-w-0 flex-col gap-3.5 rounded-dialog border border-line bg-panel px-4.5 pt-4 pb-3.5">
      <div className="flex items-baseline gap-2.5">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-2.5 w-16" />
      </div>
      <div className="flex h-36 items-end gap-1">
        {BARS.map((bar) => (
          <Skeleton key={bar.id} className="min-w-0 flex-1" style={{ height: bar.height }} />
        ))}
      </div>
    </div>
  );
}

/**
 * Analytics while Studio has not sent the requests it captured: the figures,
 * the three charts and the endpoints table, in the places and shapes they
 * take once loaded.
 *
 * @returns The page's content, loading
 * @example
 * ```tsx
 * {loading.requests ? <AnalyticsSkeleton /> : <KpiStrip figures={model.kpis} />}
 * ```
 */
export function AnalyticsSkeleton(): React.ReactNode {
  return (
    <LoadingRegion label="Loading the requests" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sheet border border-line bg-line min-[701px]:grid-cols-3 min-[1360px]:grid-cols-6">
        {KPIS.map((kpi) => (
          <div key={kpi} className="flex min-w-0 flex-col gap-3 bg-panel px-4.5 pt-4 pb-3.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-2.5 w-28" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-2.5">
        {CHARTS.map((chart) => (
          <ChartSkeleton key={chart} />
        ))}
      </div>
      <div className="overflow-hidden rounded-dialog border border-line bg-panel">
        <div className="flex h-12 items-center gap-2.5 border-b border-line px-4.5">
          <Skeleton className="h-3.5 w-20" />
        </div>
        {ROWS.map((row) => (
          <div
            key={row}
            className="flex h-10 items-center gap-3 border-b border-line px-4.5 last:border-b-0"
          >
            <Skeleton className="h-2.5 w-9" />
            <Skeleton className="h-3 w-48" />
            <span className="flex-1" />
            <Skeleton className="h-2.5 w-10" />
            <Skeleton className="h-2.5 w-12" />
            <Skeleton className="h-1.5 w-28 rounded-full" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}
