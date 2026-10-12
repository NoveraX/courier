import { LoadingRegion } from "@/design/loading-region";
import { Skeleton } from "@/design/skeleton";

const QUALITY_ROWS = ["response", "variables", "schemas"] as const;
const TABLE_ROWS = ["first", "second", "third"] as const;

function SectionHeading(): React.ReactNode {
  return (
    <div className="flex items-baseline gap-2">
      <Skeleton className="h-3.5 w-20" />
      <Skeleton className="h-2.5 w-52" />
    </div>
  );
}

function CardSkeleton(): React.ReactNode {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-sheet border border-line bg-panel">
      <div className="flex flex-col gap-3.5 px-4 pt-4 pb-3.5">
        <div className="flex min-w-0 items-start gap-2.75">
          <Skeleton className="size-8.5 rounded-[10px]" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-2.5 w-44" />
          </div>
          <Skeleton className="h-5.5 w-22 rounded-full" />
        </div>
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-panel border border-line bg-line">
          {["endpoints", "groups", "validation"].map((stat) => (
            <div key={stat} className="flex flex-col gap-1.5 bg-inset px-2.5 py-2">
              <Skeleton className="h-2.5 w-14" />
              <Skeleton className="h-3.5 w-8" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {QUALITY_ROWS.map((row) => (
            <div
              key={row}
              className="grid grid-cols-[120px_minmax(0,1fr)_44px] items-center gap-2.5"
            >
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-1 rounded-full" />
              <Skeleton className="ml-auto h-2.5 w-8" />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-auto flex items-center gap-1.5 border-t border-line bg-panel-subtle px-3 py-2.5">
        <Skeleton className="h-7 w-20 rounded-control" />
        <div className="flex-1" />
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="size-7 rounded-control" />
      </div>
    </div>
  );
}

function TableSkeleton(): React.ReactNode {
  return (
    <div className="@container overflow-hidden rounded-sheet border border-line bg-panel">
      <div className="flex h-8.5 items-center gap-3 border-b border-line bg-panel-subtle px-4 @max-[560px]:hidden">
        <Skeleton className="h-2.5 w-14" />
      </div>
      {TABLE_ROWS.map((row) => (
        <div
          key={row}
          className="grid h-10.5 grid-cols-[minmax(0,1fr)_70px_60px_120px] items-center gap-3 border-b border-line px-4 last:border-b-0 @max-[560px]:h-auto @max-[560px]:grid-cols-[auto_auto_minmax(0,1fr)] @max-[560px]:gap-y-2 @max-[560px]:py-2.5"
        >
          <span className="flex items-center gap-2.5 @max-[560px]:col-span-full">
            <Skeleton className="size-6 rounded-[7px]" />
            <Skeleton className="h-3 w-28" />
          </span>
          <Skeleton className="ml-auto h-2.5 w-5 @max-[560px]:ml-8.5 @max-[560px]:w-16" />
          <Skeleton className="ml-auto h-2.5 w-5 @max-[560px]:ml-0 @max-[560px]:w-12" />
          <Skeleton className="h-1 w-22.5 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * The APIs page while Studio has not sent its sources yet: imported APIs as
 * cards and hand-written ones as table rows, in the places and the shapes
 * they take once loaded.
 *
 * @returns The page's content, loading
 * @example
 * ```tsx
 * {loading && <ApisSkeleton />}
 * ```
 */
export function ApisSkeleton(): React.ReactNode {
  return (
    <LoadingRegion label="Loading the APIs" className="flex flex-col gap-5.5">
      <div className="flex flex-col gap-3">
        <SectionHeading />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-3">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <SectionHeading />
        <TableSkeleton />
      </div>
    </LoadingRegion>
  );
}
