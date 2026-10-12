import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import type { AnalyticsView } from "@/features/analytics/analytics-search";
import { sortedBy } from "@/features/analytics/analytics-search";
import { cn } from "@/lib/utils";
import type { EndpointColumn } from "./endpoint-columns";
import { ENDPOINT_COLUMNS, ENDPOINT_GRID, WIDE_ONLY } from "./endpoint-columns";

interface HeadsProps {
  view: AnalyticsView;
  onView: (next: AnalyticsView) => void;
  /** The rows put their figures under their names: the heads become a row of sorts of their own. */
  stacked: boolean;
}

interface HeadProps extends Omit<HeadsProps, "stacked"> {
  column: EndpointColumn;
  /** Laid out as one of a row of sorts rather than over a column. */
  free: boolean;
}

function Head({ column, view, onView, free }: HeadProps): React.ReactNode {
  const on = view.sort === column.sort;
  const Icon = on ? (view.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      title={`Sort by ${column.label}`}
      onClick={() => onView(sortedBy(view, column.sort))}
      className={cn(
        "flex h-full cursor-pointer items-center gap-1 text-label whitespace-nowrap focus-visible:outline-2 focus-visible:outline-brand",
        free || column.sort === "endpoint" ? "justify-start" : "justify-end",
        free && "shrink-0",
        on ? "font-semibold text-fg" : "font-medium text-fg-subtle",
        !free && column.wideOnly && WIDE_ONLY,
        !free && column.wideOnly && "min-[1184px]:flex",
      )}
    >
      {column.label}
      <Icon aria-hidden="true" className={cn("size-2.75", !on && "opacity-35")} />
      {on && (
        <span className="sr-only">, sorted {view.dir === "asc" ? "ascending" : "descending"}</span>
      )}
    </button>
  );
}

/**
 * The endpoints table's heads, each sorting by its column and turning it
 * around on a second click: over the columns, or — when the rows put their
 * figures under their names — in a row of their own that scrolls sideways,
 * leaving out the columns a stacked row does not show.
 *
 * @param props - The view, what changes it, and whether the rows are stacked
 * @returns The heads
 * @example
 * ```tsx
 * <EndpointHeads view={view} onView={change} stacked={false} />
 * ```
 */
export function EndpointHeads({ view, onView, stacked }: HeadsProps): React.ReactNode {
  if (stacked) {
    return (
      <div className="scroll-row h-8.5 items-center gap-4.5 border-b border-line bg-panel-subtle px-4.5 pointer-coarse:h-11">
        {ENDPOINT_COLUMNS.filter((column) => !column.wideOnly).map((column) => (
          <Head key={column.sort} column={column} view={view} onView={onView} free />
        ))}
      </div>
    );
  }
  return (
    <div
      className={cn(
        ENDPOINT_GRID,
        "h-8.5 items-center border-b border-line bg-panel-subtle px-4.5 pointer-coarse:h-11",
      )}
    >
      {ENDPOINT_COLUMNS.map((column) => (
        <Head key={column.sort} column={column} view={view} onView={onView} free={false} />
      ))}
    </div>
  );
}
