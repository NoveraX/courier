import { LoadingRegion } from "@/design/loading-region";
import { Skeleton } from "@/design/skeleton";

const CARDS = ["first", "second", "third"] as const;
const ROWS = ["w-40", "w-56", "w-32", "w-48", "w-36"] as const;

/**
 * Middleware while Studio has not sent the requests it captured: the
 * overhead, a card a middleware, and the endpoints it costs, in the places
 * and shapes they take once loaded.
 *
 * @returns The overview, loading
 * @example
 * ```tsx
 * {loading.requests ? <MiddlewareSkeleton /> : <OverheadHero … />}
 * ```
 */
export function MiddlewareSkeleton(): React.ReactNode {
  return (
    <LoadingRegion label="Loading the requests" className="flex flex-col gap-4.5">
      <div className="flex flex-col gap-3 rounded-dialog border border-line bg-panel p-5">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-3 rounded-full" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
        {CARDS.map((card) => (
          <div
            key={card}
            className="flex flex-col gap-2.5 rounded-dialog border border-line bg-panel p-4"
          >
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-1 rounded-full" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-dialog border border-line bg-panel">
        <div className="flex h-11 items-center border-b border-line px-4">
          <Skeleton className="h-3.5 w-28" />
        </div>
        {ROWS.map((width) => (
          <div
            key={width}
            className="flex h-10 items-center gap-3 border-b border-line px-4 last:border-b-0"
          >
            <Skeleton className="h-2.5 w-9" />
            <Skeleton className={`h-3 ${width}`} />
            <div className="flex-1" />
            <Skeleton className="h-1.5 w-32 rounded-full" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}
