import type { LucideIcon } from "lucide-react";
import { ChevronDown, ChevronRight, SquareArrowOutUpRight } from "lucide-react";

import { TONE_TEXT } from "@/design/tone";
import { durationLabel } from "@/features/analytics/duration-label";
import type { EndpointRow as Row } from "@/features/analytics/endpoint-rows";
import { latencyHealth } from "@/features/analytics/health";
import { formatSize } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { EndpointCalls } from "./endpoint-calls";
import { ENDPOINT_GRID, WIDE_ONLY } from "./endpoint-columns";
import { EndpointName, ErrorFigure, P95Figure } from "./endpoint-figures";

interface EndpointRowProps {
  row: Row;
  /** The slowest p95 of the table, which each p95 bar is drawn against. */
  slowestP95: number;
  slowMs: number;
  open: boolean;
  /** Puts the figures on a line under the name: a table too narrow for its columns. */
  stacked: boolean;
  onToggle: () => void;
  onOpenCall: (id: string) => void;
}

type CellsProps = Pick<EndpointRowProps, "row" | "slowestP95" | "slowMs"> & {
  caret: LucideIcon;
};

function avgTone(row: Row, slowMs: number): string {
  return row.avg === null ? "text-fg-subtle" : TONE_TEXT[latencyHealth(row.avg, slowMs)];
}

function ColumnCells({ row, slowestP95, slowMs, caret }: CellsProps): React.ReactNode {
  return (
    <>
      <EndpointName row={row} caret={caret} />
      <span className="text-right text-fg-muted">{row.calls}</span>
      <span className={cn("text-right", avgTone(row, slowMs))}>{durationLabel(row.avg)}</span>
      <span className={cn(WIDE_ONLY, "text-right text-fg-muted")}>{durationLabel(row.p50)}</span>
      <P95Figure row={row} slowestP95={slowestP95} slowMs={slowMs} />
      <span className={cn(WIDE_ONLY, "text-right text-fg-muted")}>{durationLabel(row.p99)}</span>
      <span className={cn(WIDE_ONLY, "text-right text-fg-subtle")}>
        {formatSize(Math.round(row.size))}
      </span>
      <ErrorFigure row={row} />
    </>
  );
}

/* The name and its failures on the first line; calls, average and p95, each named, under it. */
function StackedCells({ row, slowestP95, slowMs, caret }: CellsProps): React.ReactNode {
  return (
    <>
      <span className="flex min-w-0 items-center gap-3">
        <EndpointName row={row} caret={caret} className="flex-1" />
        <ErrorFigure row={row} className="shrink-0" />
      </span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-4.5 text-label text-fg-subtle">
        <span className="whitespace-nowrap">
          <span className="text-fg-muted">{row.calls}</span> {row.calls === 1 ? "call" : "calls"}
        </span>
        <span className="whitespace-nowrap">
          avg <span className={avgTone(row, slowMs)}>{durationLabel(row.avg)}</span>
        </span>
        <span className="flex items-center gap-2 whitespace-nowrap">
          p95
          <P95Figure row={row} slowestP95={slowestP95} slowMs={slowMs} fixedBar />
        </span>
      </span>
    </>
  );
}

/**
 * One endpoint of the table: its method and name, calls, response times
 * with its p95 drawn against the slowest, size and failures — in columns,
 * or, in a table too narrow for them, on a line under the name. A click
 * opens its newest calls under it — or, for an endpoint called once, that
 * call.
 *
 * @param props - The row, the slowest p95, the slow threshold, whether it is open and stacked, and what opens it and its calls
 * @returns The row
 * @example
 * ```tsx
 * <EndpointRow row={row} slowestP95={2270} slowMs={500} open={false} stacked={false} onToggle={toggle} onOpenCall={open} />
 * ```
 */
export function EndpointRow(props: EndpointRowProps): React.ReactNode {
  const { row, slowestP95, slowMs, open, stacked, onToggle, onOpenCall } = props;
  const single = row.calls === 1;
  const caret = single ? SquareArrowOutUpRight : open ? ChevronDown : ChevronRight;
  const Cells = stacked ? StackedCells : ColumnCells;
  return (
    <div className="border-b border-line last:border-b-0">
      <button
        type="button"
        aria-expanded={single ? undefined : open}
        aria-controls={single || !open ? undefined : `calls-${row.key}`}
        onClick={onToggle}
        className={cn(
          "w-full cursor-pointer px-4.5 text-left font-mono text-small tabular-nums hover:bg-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
          stacked
            ? "flex min-h-13 flex-col justify-center gap-1.25 py-2"
            : cn(ENDPOINT_GRID, "h-10 items-center pointer-coarse:h-11"),
          open && "bg-brand-tint",
        )}
      >
        <Cells row={row} slowestP95={slowestP95} slowMs={slowMs} caret={caret} />
      </button>
      {open && !single && (
        <EndpointCalls row={row} slowMs={slowMs} stacked={stacked} onOpenCall={onOpenCall} />
      )}
    </div>
  );
}
