import { ChevronDown, ChevronRight, SquareArrowOutUpRight } from "lucide-react";

import { methodText } from "@/design/method-color";
import { TONE_TEXT } from "@/design/tone";
import { durationLabel } from "@/features/analytics/duration-label";
import type { EndpointRow as Row } from "@/features/analytics/endpoint-rows";
import { errorHealth, latencyHealth } from "@/features/analytics/health";
import { formatSize } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { EndpointCalls } from "./endpoint-calls";
import { ENDPOINT_GRID, WIDE_ONLY } from "./endpoint-columns";

const BAR_FILL = { ok: "bg-ok", warn: "bg-warn", err: "bg-err" } as const;

interface EndpointRowProps {
  row: Row;
  /** The slowest p95 of the table, which each p95 bar is drawn against. */
  slowestP95: number;
  slowMs: number;
  open: boolean;
  onToggle: () => void;
  onOpenCall: (id: string) => void;
}

/**
 * One endpoint of the table: its method and name, calls, response times
 * with its p95 drawn against the slowest, size and failures. A click opens
 * its newest calls under it — or, for an endpoint called once, that call.
 *
 * @param props - The row, the slowest p95, the slow threshold, whether it is open, and what opens it and its calls
 * @returns The row
 * @example
 * ```tsx
 * <EndpointRow row={row} slowestP95={2270} slowMs={500} open={false} onToggle={toggle} onOpenCall={open} />
 * ```
 */
export function EndpointRow(props: EndpointRowProps): React.ReactNode {
  const { row, slowestP95, slowMs, open, onToggle, onOpenCall } = props;
  const single = row.calls === 1;
  const Caret = single ? SquareArrowOutUpRight : open ? ChevronDown : ChevronRight;
  const p95Tone = row.p95 === null ? null : latencyHealth(row.p95, slowMs);
  const errorTone = errorHealth(row.errorRate);
  return (
    <div className="border-b border-line last:border-b-0">
      <button
        type="button"
        aria-expanded={single ? undefined : open}
        aria-controls={single || !open ? undefined : `calls-${row.key}`}
        onClick={onToggle}
        className={cn(
          ENDPOINT_GRID,
          "h-10 w-full cursor-pointer items-center px-4.5 text-left font-mono text-small tabular-nums hover:bg-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
          open && "bg-brand-tint",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
          <Caret aria-hidden="true" className="size-3 shrink-0 text-fg-subtle" />
          <span
            className={cn(
              "w-8.5 shrink-0 text-meta font-semibold min-[1184px]:w-11",
              methodText(row.httpMethod),
            )}
          >
            {row.httpMethod}
          </span>
          <span className="truncate">
            <span className="text-fg-subtle">{row.prefix}</span>
            <span className="text-fg">{row.name}</span>
          </span>
        </span>
        <span className="text-right text-fg-muted">{row.calls}</span>
        <span
          className={cn(
            "text-right",
            row.avg === null ? "text-fg-subtle" : TONE_TEXT[latencyHealth(row.avg, slowMs)],
          )}
        >
          {durationLabel(row.avg)}
        </span>
        <span className={cn(WIDE_ONLY, "text-right text-fg-muted")}>{durationLabel(row.p50)}</span>
        <span className="flex items-center justify-end gap-2">
          <span className="flex h-1 max-w-10 flex-1 justify-end overflow-hidden rounded-[2px] bg-raised min-[1184px]:max-w-22.5">
            <span
              className={cn("h-full rounded-[2px]", p95Tone && BAR_FILL[p95Tone])}
              style={{ width: `${((row.p95 ?? 0) / slowestP95) * 100}%` }}
            />
          </span>
          <span
            className={cn("min-w-12 text-right", p95Tone ? TONE_TEXT[p95Tone] : "text-fg-subtle")}
          >
            {durationLabel(row.p95)}
          </span>
        </span>
        <span className={cn(WIDE_ONLY, "text-right text-fg-muted")}>{durationLabel(row.p99)}</span>
        <span className={cn(WIDE_ONLY, "text-right text-fg-subtle")}>
          {formatSize(Math.round(row.size))}
        </span>
        <span className="flex items-center justify-end gap-1.5">
          <span className={TONE_TEXT[errorTone]}>{row.errorRate.toFixed(1)}%</span>
          {row.failed > 0 && (
            <span className="flex h-4.25 items-center rounded-chip bg-err-dim px-1.25 text-micro font-semibold text-err">
              {row.failed}
            </span>
          )}
        </span>
      </button>
      {open && !single && <EndpointCalls row={row} slowMs={slowMs} onOpenCall={onOpenCall} />}
    </div>
  );
}
