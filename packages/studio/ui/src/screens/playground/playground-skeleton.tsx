import { LoadingRegion } from "@/design/loading-region";
import { Skeleton } from "@/design/skeleton";
import { cn } from "@/lib/utils";

const LINES = ["w-40", "w-56", "w-32", "w-64", "w-48", "w-36", "w-52", "w-28"] as const;

function Pane({
  label,
  border,
  className,
}: {
  label: string;
  border: boolean;
  className?: string;
}): React.ReactNode {
  return (
    <div className={cn("flex min-h-0 flex-col", border && "border-r border-line", className)}>
      <div className="flex h-10 shrink-0 items-center gap-4 border-b border-line px-5">
        {["first", "second", "third"].map((tab) => (
          <Skeleton key={`${label}-${tab}`} className="h-2.5 w-14" />
        ))}
      </div>
      <div className="flex flex-col gap-2.5 px-5 py-4">
        {LINES.map((width, i) => (
          <Skeleton key={`${label}-${width}`} className={cn("h-3", width, i % 3 === 1 && "ml-4")} />
        ))}
      </div>
    </div>
  );
}

/**
 * The Playground while Studio has not told whether an app is attached or
 * which endpoints it serves: the endpoint, its URL and Send, over the
 * request and the response panes, in the places and shapes they take once
 * loaded — on a phone, the bar's two rows over the switch and one pane.
 *
 * @returns The Playground, loading
 * @example
 * ```tsx
 * if (waiting) return <PlaygroundSkeleton />;
 * ```
 */
export function PlaygroundSkeleton(): React.ReactNode {
  return (
    <LoadingRegion label="Loading the endpoints" className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-13.5 shrink-0 flex-wrap items-center gap-2 border-b border-line py-2.5 pr-4 pl-5">
        <Skeleton className="h-8 w-56 rounded-control max-sm:basis-full" />
        <Skeleton className="h-8 min-w-0 flex-1 rounded-control max-sm:w-36 max-sm:flex-none" />
        <Skeleton className="h-8 w-20 rounded-control max-sm:ml-auto" />
      </div>
      <div className="hidden shrink-0 border-b border-line px-4 py-1.5 max-sm:block">
        <Skeleton className="h-10.5 rounded-card" />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] max-[900px]:grid-cols-1">
        <Pane label="request" border />
        <Pane label="response" border={false} className="max-sm:hidden" />
      </div>
    </LoadingRegion>
  );
}
