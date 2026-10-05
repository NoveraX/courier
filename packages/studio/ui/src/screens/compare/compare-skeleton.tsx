import { LoadingRegion } from "@/design/loading-region";
import { Skeleton } from "@/design/skeleton";

const CELLS = ["status", "duration", "size", "headers"] as const;
const LINES = ["w-48", "w-64", "w-40", "w-56", "w-32", "w-52"] as const;

function Slot(): React.ReactNode {
  return (
    <div className="flex flex-col gap-2.5 rounded-dialog border border-line bg-panel p-4">
      <Skeleton className="h-2.5 w-10" />
      <Skeleton className="h-3.5 w-48" />
      <Skeleton className="h-2.5 w-32" />
    </div>
  );
}

/**
 * Compare while Studio has not sent the requests it captured: the two sides,
 * the summary between them and the body, in the places and shapes they take
 * once loaded.
 *
 * @returns The comparison, loading
 * @example
 * ```tsx
 * {loading.requests ? <CompareSkeleton /> : <RequestSlot … />}
 * ```
 */
export function CompareSkeleton(): React.ReactNode {
  return (
    <LoadingRegion label="Loading the requests" className="flex flex-col gap-4">
      <div className="grid grid-cols-[minmax(0,1fr)_36px_minmax(0,1fr)] items-center gap-2.5">
        <Slot />
        <Skeleton className="size-9 rounded-full" />
        <Slot />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-px overflow-hidden rounded-sheet border border-line bg-line">
        {CELLS.map((cell) => (
          <div key={cell} className="flex flex-col gap-2 bg-panel px-4 py-3">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2.5 rounded-dialog border border-line bg-panel p-4">
        {LINES.map((width) => (
          <Skeleton key={width} className={`h-3 ${width}`} />
        ))}
      </div>
    </LoadingRegion>
  );
}
