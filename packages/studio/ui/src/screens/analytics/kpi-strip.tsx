import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { TONE_TEXT } from "@/design/tone";
import type { KpiFigure } from "@/features/analytics/kpi-figures";
import type { SparkTone } from "@/features/analytics/kpi-values";
import type { Trend } from "@/features/analytics/trend";
import { cn } from "@/lib/utils";
import { SparkLine } from "./spark-line";

const SPARK_TEXT: Readonly<Record<SparkTone, string>> = {
  brand: "text-brand",
  ok: "text-ok",
  warn: "text-warn",
  err: "text-err",
  type: "text-syntax-type",
};

const TREND_ICON = { up: ArrowUp, down: ArrowDown, flat: Minus } as const;

function TrendMark({ trend }: { trend: Trend }): React.ReactNode {
  const Icon = TREND_ICON[trend.direction];
  const tone = trend.good === null ? "text-fg-subtle" : trend.good ? "text-ok" : "text-err";
  return (
    <span
      title="vs the first half of the range"
      className={cn(
        "inline-flex items-center gap-0.75 text-badge font-semibold whitespace-nowrap",
        tone,
      )}
    >
      <Icon aria-hidden="true" className="size-2.75" />
      {trend.label}
      <span className="sr-only"> vs the first half of the range</span>
    </span>
  );
}

/**
 * Analytics' six headline figures across the top: each with its value in
 * the colour it reads in, its move since the first half of the range, a
 * sparkline across the range and a line of context.
 *
 * @param props - The figures
 * @returns The strip
 * @example
 * ```tsx
 * <KpiStrip figures={kpiFigures(win, "session", 500)} />
 * ```
 */
export function KpiStrip({ figures }: { figures: readonly KpiFigure[] }): React.ReactNode {
  return (
    <section
      aria-label="Headline figures"
      className="grid grid-cols-2 gap-px overflow-hidden rounded-sheet border border-line bg-line min-[701px]:grid-cols-3 min-[1360px]:grid-cols-6"
    >
      {figures.map((figure) => (
        <div key={figure.key} className="flex min-w-0 flex-col gap-3 bg-panel px-4.5 pt-4 pb-3.5">
          <span className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 shrink-0 rounded-[2px] bg-current",
                SPARK_TEXT[figure.sparkTone],
              )}
            />
            <span className="text-small font-medium whitespace-nowrap text-fg-muted">
              {figure.label}
            </span>
          </span>
          <span className="flex min-w-0 items-baseline gap-2.5">
            <span
              className={cn(
                "truncate font-mono text-kpi leading-none font-medium tracking-[-0.04em] tabular-nums",
                TONE_TEXT[figure.tone],
              )}
            >
              {figure.value}
            </span>
            <TrendMark trend={figure.trend} />
          </span>
          <SparkLine spark={figure.spark} tone={SPARK_TEXT[figure.sparkTone]} />
          <span className="truncate text-label text-fg-subtle">{figure.sub}</span>
        </div>
      ))}
    </section>
  );
}
