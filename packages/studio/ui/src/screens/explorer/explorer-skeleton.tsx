import { LoadingRegion } from "@/design/loading-region";
import { Skeleton } from "@/design/skeleton";
import { cn } from "@/lib/utils";

/** The Explorer's views, each loading in its own shape. */
export type ExplorerView = "graph" | "overview" | "endpoints" | "heatmap";

const list = (length: number, prefix: string): string[] =>
  Array.from({ length }, (_, i) => `${prefix}-${i}`);
const NAMES = ["w-24", "w-32", "w-20", "w-28", "w-36"] as const;
const nameAt = (i: number): string => NAMES[i % NAMES.length] ?? "w-24";

function Bar({ wide }: { wide: string }): React.ReactNode {
  return (
    <div className="flex shrink-0 items-center gap-3.5 border-b border-line bg-bg-subtle py-2.5 pr-4 pl-5">
      <Skeleton className={cn("h-7.5 min-w-0 rounded-control", wide)} />
      <div className="flex-1" />
      <Skeleton className="h-2.5 w-56 max-sm:w-16" />
    </div>
  );
}

function Column({ cards, wide }: { cards: string[]; wide: string }): React.ReactNode {
  return (
    <div className="flex flex-col justify-center gap-2.5">
      <Skeleton className="mb-1 h-2.5 w-16" />
      {cards.map((card, i) => (
        <div
          key={card}
          className={cn(
            "flex h-10 items-center gap-2.25 rounded-panel border border-line bg-panel px-3",
            wide,
          )}
        >
          <Skeleton className="h-2.5 w-8" />
          <Skeleton className={cn("h-3", nameAt(i))} />
          <span className="flex-1" />
          <Skeleton className="h-2.5 w-8" />
        </div>
      ))}
    </div>
  );
}

function Graph(): React.ReactNode {
  return (
    <>
      <Bar wide="w-65" />
      <div className="flex min-h-0 flex-1 items-center justify-center gap-16 overflow-hidden">
        <Column cards={list(2, "source")} wide="w-56" />
        <Column cards={list(3, "group")} wide="w-56" />
        <Column cards={list(7, "endpoint")} wide="w-72" />
      </div>
    </>
  );
}

function Overview(): React.ReactNode {
  return (
    <div className="mx-auto flex w-full max-w-360 flex-col gap-3.5 px-6 pt-5 pb-10 max-sm:px-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3.5">
        {list(4, "figure").map((figure) => (
          <div
            key={figure}
            className="flex flex-col gap-2.5 rounded-dialog border border-line bg-panel p-4"
          >
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-6 w-14" />
          </div>
        ))}
      </div>
      {list(2, "pair").map((pair) => (
        <div
          key={pair}
          className="grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] gap-3.5"
        >
          <Skeleton className="h-56 rounded-dialog" />
          <Skeleton className="h-56 rounded-dialog" />
        </div>
      ))}
    </div>
  );
}

function Rows({ height, cells }: { height: string; cells: number }): React.ReactNode {
  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      {list(12, "row").map((row, i) => (
        <div
          key={row}
          className={cn("flex items-center gap-3 border-b border-line pr-4 pl-5", height)}
        >
          <Skeleton className="h-2.5 w-9" />
          <Skeleton className={cn("h-3", nameAt(i))} />
          <span className="flex-1" />
          {list(cells, `${row}-cell`).map((cell, at) => (
            <Skeleton key={cell} className={cn("h-3 w-12", at > 1 && "max-sm:hidden")} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * An Explorer view while Studio has not sent the project's sources: the
 * graph's columns of cards, the overview's figures and panels, the
 * endpoints' rows or the heatmap's, in the places and shapes they take once
 * loaded.
 *
 * @param props - The view loading
 * @returns The view, loading
 * @example
 * ```tsx
 * if (!model.endpoints.length) return loading.sources ? <ExplorerSkeleton view="graph" /> : <ExplorerEmpty />;
 * ```
 */
export function ExplorerSkeleton({ view }: { view: ExplorerView }): React.ReactNode {
  return (
    <LoadingRegion label="Loading the endpoints" className="flex min-h-0 flex-1 flex-col">
      {view === "graph" && <Graph />}
      {view === "overview" && <Overview />}
      {view === "endpoints" && (
        <>
          <Bar wide="w-70" />
          <Rows height="h-10.5" cells={4} />
        </>
      )}
      {view === "heatmap" && (
        <>
          <Bar wide="w-48" />
          <Rows height="h-8" cells={10} />
        </>
      )}
    </LoadingRegion>
  );
}
