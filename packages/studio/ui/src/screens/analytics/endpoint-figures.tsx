import type { LucideIcon } from "lucide-react";

import { methodText } from "@/design/method-color";
import { TONE_TEXT } from "@/design/tone";
import { durationLabel } from "@/features/analytics/duration-label";
import type { EndpointRow } from "@/features/analytics/endpoint-rows";
import { errorHealth, latencyHealth } from "@/features/analytics/health";
import { cn } from "@/lib/utils";

const BAR_FILL = { ok: "bg-ok", warn: "bg-warn", err: "bg-err" } as const;

interface EndpointNameProps {
  row: EndpointRow;
  /** What a click on the row does: opens its calls, closes them, or opens its only call. */
  caret: LucideIcon;
  className?: string | undefined;
}

/**
 * An endpoint's method and name, after the mark of what a click on its row
 * does; the name gives way first when the row is short of room.
 *
 * @param props - The endpoint, the mark, and classes for the line
 * @returns The name
 * @example
 * ```tsx
 * <EndpointName row={row} caret={ChevronRight} />
 * ```
 */
export function EndpointName({ row, caret: Caret, className }: EndpointNameProps): React.ReactNode {
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap",
        className,
      )}
    >
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
  );
}

interface P95FigureProps {
  row: EndpointRow;
  /** The slowest p95 of the table, which the bar is drawn against. */
  slowestP95: number;
  slowMs: number;
  /** Gives the bar a width of its own, for a line laid out by its content rather than a column. */
  fixedBar?: boolean | undefined;
}

/**
 * An endpoint's p95: a bar of it against the slowest of the table, and the
 * figure, both in the colour its health reads in.
 *
 * @param props - The endpoint, the slowest p95, the slow threshold, and whether the bar sizes itself
 * @returns The figure
 * @example
 * ```tsx
 * <P95Figure row={row} slowestP95={2270} slowMs={500} />
 * ```
 */
export function P95Figure({ row, slowestP95, slowMs, fixedBar }: P95FigureProps): React.ReactNode {
  const tone = row.p95 === null ? null : latencyHealth(row.p95, slowMs);
  return (
    <span className="flex items-center justify-end gap-2">
      <span
        className={cn(
          "flex h-1 justify-end overflow-hidden rounded-[2px] bg-raised",
          fixedBar ? "w-10" : "max-w-10 flex-1 min-[1184px]:max-w-22.5",
        )}
      >
        <span
          className={cn("h-full rounded-[2px]", tone && BAR_FILL[tone])}
          style={{ width: `${((row.p95 ?? 0) / slowestP95) * 100}%` }}
        />
      </span>
      <span
        className={cn(
          !fixedBar && "min-w-12 text-right",
          tone ? TONE_TEXT[tone] : "text-fg-subtle",
        )}
      >
        {durationLabel(row.p95)}
      </span>
    </span>
  );
}

/**
 * An endpoint's error rate in the colour its health reads in, with how
 * many of its calls failed beside it when any did.
 *
 * @param props - The endpoint, and classes for the figure
 * @returns The figure
 * @example
 * ```tsx
 * <ErrorFigure row={row} />
 * ```
 */
export function ErrorFigure({
  row,
  className,
}: {
  row: EndpointRow;
  className?: string | undefined;
}): React.ReactNode {
  return (
    <span className={cn("flex items-center justify-end gap-1.5", className)}>
      <span className={TONE_TEXT[errorHealth(row.errorRate)]}>{row.errorRate.toFixed(1)}%</span>
      <span className="sr-only"> errors</span>
      {row.failed > 0 && (
        <span className="flex h-4.25 items-center rounded-chip bg-err-dim px-1.25 text-micro font-semibold text-err">
          {row.failed}
        </span>
      )}
    </span>
  );
}
