import { LoadingRegion } from "@/design/loading-region";
import { Skeleton } from "@/design/skeleton";
import { cn } from "@/lib/utils";

const FIGURES = ["routes", "throughput", "errors", "latency", "scenario", "chaos"] as const;
const NAMES = ["w-28", "w-40", "w-24", "w-36", "w-32", "w-44"] as const;
const rows = (count: number): Array<{ id: string; name: string }> =>
  Array.from({ length: count }, (_, i) => ({
    id: `row-${i}`,
    name: NAMES[i % NAMES.length] ?? "w-28",
  }));

function Panel({ count, className }: { count: number; className?: string }): React.ReactNode {
  return (
    <div className={cn("overflow-hidden rounded-dialog border border-line bg-panel", className)}>
      <div className="flex h-11 items-center border-b border-line px-4">
        <Skeleton className="h-3.5 w-28" />
      </div>
      {rows(count).map((row) => (
        <div
          key={row.id}
          className="flex h-9.5 items-center gap-3 border-b border-line px-4 last:border-b-0"
        >
          <Skeleton className="h-2.5 w-9" />
          <Skeleton className={cn("h-3", row.name)} />
          <span className="flex-1" />
          <Skeleton className="h-2.5 w-12" />
        </div>
      ))}
    </div>
  );
}

/**
 * A Mocks view while Studio has not sent its mock servers: the dashboard's
 * figures and panels, or a tab's list, in the places and shapes they take
 * once loaded.
 *
 * @param props - Which view is loading
 * @returns The view, loading
 * @example
 * ```tsx
 * if (!server) return loading ? <MocksSkeleton view="dashboard" /> : <NoServers />;
 * ```
 */
export function MocksSkeleton({ view }: { view: "dashboard" | "list" }): React.ReactNode {
  if (view === "list") {
    return (
      <LoadingRegion label="Loading the mock servers" className="flex flex-col p-5">
        <Panel count={8} />
      </LoadingRegion>
    );
  }
  return (
    <LoadingRegion
      label="Loading the mock servers"
      className="mx-auto flex w-full max-w-360 flex-col gap-3.5 px-6 pt-5 pb-10"
    >
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sheet border border-line bg-line min-[701px]:grid-cols-3 min-[1360px]:grid-cols-6">
        {FIGURES.map((figure) => (
          <div key={figure} className="flex min-w-0 flex-col gap-2.5 bg-panel px-4 py-3.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5.5 w-12" />
            <Skeleton className="h-2.5 w-24" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] gap-3.5">
        <Panel count={8} />
        <div className="flex flex-col gap-3.5">
          <Panel count={4} />
          <Panel count={2} />
        </div>
      </div>
    </LoadingRegion>
  );
}
