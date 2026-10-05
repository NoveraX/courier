import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useState } from "react";

import type { AnalyticsView } from "@/features/analytics/analytics-search";
import { sortedBy } from "@/features/analytics/analytics-search";
import type { EndpointRow as Row } from "@/features/analytics/endpoint-rows";
import { cn } from "@/lib/utils";
import type { EndpointColumn } from "./endpoint-columns";
import { ENDPOINT_COLUMNS, ENDPOINT_GRID, WIDE_ONLY } from "./endpoint-columns";
import { EndpointRow } from "./endpoint-row";

/* How many endpoints the table lists until asked for all. */
const TOP = 10;

interface EndpointsTableProps {
  rows: readonly Row[];
  view: AnalyticsView;
  slowMs: number;
  onView: (next: AnalyticsView) => void;
  onOpenCall: (id: string) => void;
}

function Head({
  column,
  view,
  onView,
}: {
  column: EndpointColumn;
  view: AnalyticsView;
  onView: (next: AnalyticsView) => void;
}): React.ReactNode {
  const on = view.sort === column.sort;
  const Icon = on ? (view.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      title={`Sort by ${column.label}`}
      onClick={() => onView(sortedBy(view, column.sort))}
      className={cn(
        "flex h-full cursor-pointer items-center gap-1 text-label whitespace-nowrap focus-visible:outline-2 focus-visible:outline-brand",
        column.sort === "endpoint" ? "justify-start" : "justify-end",
        on ? "font-semibold text-fg" : "font-medium text-fg-subtle",
        column.wideOnly && WIDE_ONLY,
        column.wideOnly && "min-[1184px]:flex",
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
 * Every endpoint the range's calls reached, slowest p95 first unless
 * sorted otherwise by a column's head: the top ten until asked for all,
 * each opening its newest calls.
 *
 * @param props - The rows in order, the view, the slow threshold, and what changes the view and opens a call
 * @returns The table
 * @example
 * ```tsx
 * <EndpointsTable rows={rows} view={view} slowMs={500} onView={change} onOpenCall={open} />
 * ```
 */
export function EndpointsTable(props: EndpointsTableProps): React.ReactNode {
  const { rows, view, slowMs, onView, onOpenCall } = props;
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const slowestP95 = Math.max(1, ...rows.map((row) => row.p95 ?? 0));
  const shown = all ? rows : rows.slice(0, TOP);
  const toggle = (row: Row): void => {
    const [only] = row.requests;
    if (row.calls === 1 && only) onOpenCall(only.id);
    else setOpenKey((key) => (key === row.key ? null : row.key));
  };
  return (
    <section
      aria-label="Endpoints"
      className="overflow-hidden rounded-dialog border border-line bg-panel"
    >
      <div className="flex h-12 items-center gap-2.5 border-b border-line px-4.5">
        <h2 className="m-0 text-ui font-semibold">Endpoints</h2>
        <span className="flex h-4.25 min-w-5 items-center justify-center rounded-full bg-raised px-1.5 text-meta text-fg-subtle tabular-nums">
          {rows.length}
        </span>
        <div className="flex-1" />
        <span className="text-label text-fg-subtle">Click a row to see its calls</span>
      </div>
      <div
        className={cn(
          ENDPOINT_GRID,
          "h-8.5 items-center border-b border-line bg-panel-subtle px-4.5",
        )}
      >
        {ENDPOINT_COLUMNS.map((column) => (
          <Head key={column.sort} column={column} view={view} onView={onView} />
        ))}
      </div>
      {shown.map((row) => (
        <EndpointRow
          key={row.key}
          row={row}
          slowestP95={slowestP95}
          slowMs={slowMs}
          open={openKey === row.key}
          onToggle={() => toggle(row)}
          onOpenCall={onOpenCall}
        />
      ))}
      {rows.length > TOP && (
        <div className="flex justify-center p-2.5">
          <button
            type="button"
            onClick={() => setAll((on) => !on)}
            className="h-7.5 cursor-pointer rounded-control border border-line px-3 text-control text-fg-muted hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-brand"
          >
            {all ? `Show top ${TOP}` : `Show all ${rows.length} endpoints`}
          </button>
        </div>
      )}
    </section>
  );
}
