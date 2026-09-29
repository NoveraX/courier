import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type SkeletonLayout = "cards" | "list" | "table";

interface LoadingSkeletonProps {
  layout: SkeletonLayout;
  count?: number;
  className?: string;
}

export function LoadingSkeleton({
  layout,
  count = 5,
  className,
}: LoadingSkeletonProps): React.ReactElement {
  return (
    <div className={cn("space-y-3 p-4", className)}>
      {layout === "cards" && <CardsSkeleton count={count} />}
      {layout === "list" && <ListSkeleton count={count} />}
      {layout === "table" && <TableSkeleton count={count} />}
    </div>
  );
}

function CardsSkeleton({ count }: { count: number }): React.ReactElement {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows with no data of their own
        <div key={i} className="space-y-3 rounded-lg border border-border-subtle p-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-10 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ListSkeleton({ count }: { count: number }): React.ReactElement {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows with no data of their own
        <div key={i} className="flex items-center gap-3 rounded-md px-3 py-2">
          <Skeleton className="h-5 w-12 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton({ count }: { count: number }): React.ReactElement {
  return (
    <div className="space-y-2">
      <div className="flex gap-4 border-b border-border-subtle pb-2">
        {Array.from({ length: 5 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows with no data of their own
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows with no data of their own
        <div key={i} className="flex gap-4 py-2">
          {Array.from({ length: 5 }, (_, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows with no data of their own
            <Skeleton key={j} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
