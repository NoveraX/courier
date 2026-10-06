import { LoadingRegion } from "@/design/loading-region";
import { Skeleton } from "@/design/skeleton";
import { cn } from "@/lib/utils";

/* Endpoint names vary in length; the rows do too, so the list reads as a list. */
const NAME_WIDTHS = ["w-44", "w-60", "w-36", "w-52", "w-40", "w-64", "w-48", "w-32"] as const;
const ROWS = Array.from({ length: 14 }, (_, i) => ({
  id: `row-${i}`,
  width: NAME_WIDTHS[i % NAME_WIDTHS.length],
}));
const BARS = Array.from({ length: 60 }, (_, i) => `bar-${i}`);
const KPIS = ["rate", "latency", "errors", "streams"] as const;

function StripSkeleton(): React.ReactNode {
  return (
    <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-6 border-b border-line pt-3 pr-4 pb-2.5 pl-5">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex h-10 items-end gap-0.5">
          {BARS.map((bar) => (
            <span key={bar} className="block h-1 min-w-0 flex-1 rounded-[1.5px] bg-raised" />
          ))}
        </div>
        <div className="flex justify-between">
          <Skeleton className="h-2 w-6" />
          <Skeleton className="h-2 w-6" />
          <Skeleton className="h-2 w-6" />
        </div>
      </div>
      <div className="flex gap-5.5 pb-4">
        {KPIS.map((kpi) => (
          <div key={kpi} className="flex flex-col items-end gap-1.5">
            <Skeleton className="h-2.5 w-12" />
            <Skeleton className="h-4.5 w-9" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The Timeline while Studio has not sent the requests it captured: the
 * throughput strip and request rows in the places and shapes they take once
 * loaded, under the toolbar and the filters, which work as they do then.
 *
 * @returns The strip and the list, loading
 * @example
 * ```tsx
 * {loading.requests ? <TimelineSkeleton /> : <RequestTable requests={shown} />}
 * ```
 */
export function TimelineSkeleton(): React.ReactNode {
  return (
    <LoadingRegion label="Loading the requests" className="flex min-h-0 flex-1 flex-col">
      <StripSkeleton />
      <div className="flex h-7.5 shrink-0 items-center border-b border-line pr-4 pl-5" />
      <div className="min-h-0 flex-1 overflow-hidden">
        {ROWS.map((row) => (
          <div
            key={row.id}
            className="grid h-8.5 grid-cols-[50px_minmax(120px,1fr)_44px_104px_92px_14px] items-center gap-3 border-b border-line pr-4 pl-5"
          >
            <Skeleton className="h-2.5 w-8" />
            <Skeleton className={cn("h-3", row.width)} />
            <Skeleton className="h-2.5 w-7" />
            <Skeleton className="ml-auto h-2.5 w-14" />
            <Skeleton className="ml-auto h-2.5 w-12" />
            <span />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}
