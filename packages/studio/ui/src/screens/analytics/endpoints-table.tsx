import { useRef, useState } from "react";

import { listTierOf } from "@/design/breakpoints";
import type { AnalyticsView } from "@/features/analytics/analytics-search";
import type { EndpointRow as Row } from "@/features/analytics/endpoint-rows";
import { useElementWidth } from "@/hooks/use-element-width";
import { ENDPOINTS_WIDE_FROM } from "./endpoint-columns";
import { EndpointHeads } from "./endpoint-heads";
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

/**
 * Every endpoint the range's calls reached, slowest p95 first unless
 * sorted otherwise by a column's head: the top ten until asked for all,
 * each opening its newest calls. In a table too narrow for its columns —
 * on a phone — each row puts its figures on a line under its name, so the
 * name keeps the room it needs.
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
  const tableRef = useRef<HTMLElement>(null);
  /* Until the table is measured, the window's width stands in for it: a phone stacks from the first frame. */
  const width = useElementWidth(tableRef, window.innerWidth);
  const stacked = listTierOf(width, ENDPOINTS_WIDE_FROM) === "stacked";
  const slowestP95 = Math.max(1, ...rows.map((row) => row.p95 ?? 0));
  const shown = all ? rows : rows.slice(0, TOP);
  const toggle = (row: Row): void => {
    const [only] = row.requests;
    if (row.calls === 1 && only) onOpenCall(only.id);
    else setOpenKey((key) => (key === row.key ? null : row.key));
  };
  return (
    <section
      ref={tableRef}
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
      <EndpointHeads view={view} onView={onView} stacked={stacked} />
      {shown.map((row) => (
        <EndpointRow
          key={row.key}
          row={row}
          slowestP95={slowestP95}
          slowMs={slowMs}
          open={openKey === row.key}
          stacked={stacked}
          onToggle={() => toggle(row)}
          onOpenCall={onOpenCall}
        />
      ))}
      {rows.length > TOP && (
        <div className="flex justify-center p-2.5">
          <button
            type="button"
            onClick={() => setAll((on) => !on)}
            className="h-7.5 cursor-pointer rounded-control border border-line px-3 text-control text-fg-muted hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-brand pointer-coarse:h-9"
          >
            {all ? `Show top ${TOP}` : `Show all ${rows.length} endpoints`}
          </button>
        </div>
      )}
    </section>
  );
}
