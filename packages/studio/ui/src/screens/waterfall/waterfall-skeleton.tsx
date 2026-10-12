import { LoadingRegion } from "@/design/loading-region";
import { Skeleton } from "@/design/skeleton";
import { cn } from "@/lib/utils";

const INSIGHTS = ["span", "peak", "slowest", "share"] as const;
const LABEL =
  "w-[clamp(240px,32%,320px)] @max-[559px]:h-6 @max-[559px]:w-full @max-[559px]:border-r-0 @max-[559px]:pl-4";
/* A row is one line beside a column of labels, or two where the chart is too narrow for one. */
const ROW = "flex h-8 border-b border-line @max-[559px]:h-11 @max-[559px]:flex-col";
/* Each row's bar starts later and runs for its own while, as requests do. */
const ROWS = Array.from({ length: 13 }, (_, i) => ({
  id: `row-${i}`,
  name: ["w-28", "w-36", "w-24", "w-32", "w-40"][i % 5],
  left: `${(i * 7) % 62}%`,
  width: `${8 + ((i * 11) % 26)}%`,
}));

/**
 * The Waterfall while Studio has not sent the requests it captured: the
 * insight figures, the ruler and request rows with their bars, in the
 * places and shapes they take once loaded — each row's label over its bar
 * where the chart is too narrow for a column of labels.
 *
 * @returns The figures and the chart, loading
 * @example
 * ```tsx
 * {loading.requests ? <WaterfallSkeleton /> : <WaterfallChart … />}
 * ```
 */
export function WaterfallSkeleton(): React.ReactNode {
  return (
    <LoadingRegion label="Loading the requests" className="@container flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(170px,1fr))] border-b border-line max-sm:scroll-row">
        {INSIGHTS.map((insight) => (
          <div
            key={insight}
            className="flex min-w-0 items-center gap-3 border-r border-line py-3 pr-4 pl-5 max-sm:w-44 max-sm:shrink-0 max-sm:gap-2.5 max-sm:py-2.5 max-sm:pr-3 max-sm:pl-4 short-screen:py-2"
          >
            <Skeleton className="size-7 rounded-card" />
            <div className="flex min-w-0 flex-col gap-1.5">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-3.5 w-14" />
              <Skeleton className="h-2.5 w-24" />
            </div>
          </div>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-8 border-b border-line">
          <span
            className={cn(
              "flex shrink-0 items-center border-r border-line pl-5 @max-[559px]:hidden",
              LABEL,
            )}
          >
            <Skeleton className="h-2.5 w-16" />
          </span>
        </div>
        {ROWS.map((row) => (
          <div key={row.id} className={ROW}>
            <span
              className={cn(
                "flex shrink-0 items-center gap-2.25 border-r border-line pr-3 pl-5",
                LABEL,
              )}
            >
              <Skeleton className="h-2.5 w-8" />
              <Skeleton className={cn("h-3", row.name)} />
              <span className="flex-1" />
              <Skeleton className="h-2.5 w-10" />
            </span>
            <span className="relative min-w-0 flex-1 @max-[559px]:h-4.75 @max-[559px]:flex-none">
              <Skeleton
                className="absolute top-2.25 h-3.5 @max-[559px]:top-0.5"
                style={{ left: row.left, width: row.width }}
              />
            </span>
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}
