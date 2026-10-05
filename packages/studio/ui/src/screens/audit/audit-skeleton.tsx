import { LoadingRegion } from "@/design/loading-region";
import { Skeleton } from "@/design/skeleton";

const CATEGORIES = ["performance", "reliability", "security", "practices"] as const;
const FINDINGS = ["w-72", "w-96", "w-64", "w-80", "w-56"] as const;

/**
 * The Audit while Studio has not sent the requests it captured: the score
 * with its categories, the filters, and finding cards, in the places and
 * shapes they take once loaded.
 *
 * @returns The report, loading
 * @example
 * ```tsx
 * {loading.requests ? <AuditSkeleton /> : <ScoreHero … />}
 * ```
 */
export function AuditSkeleton(): React.ReactNode {
  return (
    <LoadingRegion label="Loading the requests" className="flex flex-col gap-4.5">
      <div className="flex flex-wrap items-center gap-6 rounded-dialog border border-line bg-panel p-5">
        <Skeleton className="size-24 rounded-full" />
        <div className="grid min-w-0 flex-1 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          {CATEGORIES.map((category) => (
            <div key={category} className="flex flex-col gap-2 rounded-card border border-line p-3">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-5 w-10" />
              <Skeleton className="h-1 rounded-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-7.5 w-64 rounded-control" />
        <div className="flex-1" />
        <Skeleton className="h-7.5 w-52 rounded-control" />
      </div>
      <div className="flex flex-col gap-2">
        {FINDINGS.map((width) => (
          <div
            key={width}
            className="flex h-14 items-center gap-3 rounded-card border border-line bg-panel px-4"
          >
            <Skeleton className="size-2 rounded-full" />
            <Skeleton className={`h-3 ${width} max-w-[60%]`} />
            <div className="flex-1" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}
