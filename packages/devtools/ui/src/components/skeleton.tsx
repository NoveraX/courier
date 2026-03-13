import { Skeleton } from "@/components/ui/skeleton";

/** Generic tab skeleton: toolbar + list rows */
export function TabSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-3 py-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-6 w-40" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-16" />
        </div>
      </div>
      <div className="flex-1 space-y-1 p-2">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

/** Skeleton matching graph/flow views */
export function GraphSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-3 py-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-6 w-48" />
      </div>
      <div className="flex flex-1 items-center justify-center">
        <div className="flex gap-8">
          <Skeleton className="h-24 w-32 rounded-lg" />
          <Skeleton className="h-24 w-32 rounded-lg" />
          <Skeleton className="h-24 w-32 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/** Skeleton for grid/card layouts (analytics, settings) */
export function GridSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-3 py-2">
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="grid grid-cols-2 gap-4 p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
