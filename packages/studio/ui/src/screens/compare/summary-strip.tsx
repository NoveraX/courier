import type { LucideIcon } from "lucide-react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Clock,
  Equal,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { TONE_DIM, TONE_TEXT } from "@/design/tone";
import type { SummaryCell } from "@/features/compare/compare-summary";
import { cn } from "@/lib/utils";

const ICON: Readonly<Record<SummaryCell["delta"]["icon"], LucideIcon>> = {
  same: Equal,
  up: ArrowUp,
  down: ArrowDown,
  worse: TrendingDown,
  better: TrendingUp,
  clock: Clock,
};

/**
 * The comparison at a glance: each figure's value on A, on B, and a chip
 * saying how it moved.
 *
 * @param props - The figures
 * @returns The strip
 * @example
 * ```tsx
 * <SummaryStrip cells={compareSummary(a, b)} />
 * ```
 */
export function SummaryStrip({ cells }: { cells: readonly SummaryCell[] }): React.ReactNode {
  return (
    <section
      aria-label="At a glance"
      className="grid grid-cols-2 gap-px overflow-hidden rounded-sheet border border-line bg-line min-[701px]:grid-cols-4"
    >
      {cells.map((cell) => {
        const Icon = ICON[cell.delta.icon];
        return (
          <div key={cell.label} className="flex min-w-0 flex-col gap-2 bg-panel px-4 py-3.5">
            <span className="text-label whitespace-nowrap text-fg-subtle">{cell.label}</span>
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono whitespace-nowrap">
              <span className="text-title text-fg-muted">{cell.a}</span>
              <ArrowRight aria-label="to" className="size-2.75 text-fg-subtle" />
              <span className="text-metric font-medium text-fg">{cell.b}</span>
            </span>
            <span
              className={cn(
                "flex h-5 items-center gap-1 self-start rounded-full px-1.75 font-mono text-badge font-semibold",
                TONE_TEXT[cell.delta.tone],
                TONE_DIM[cell.delta.tone],
              )}
            >
              <Icon aria-hidden="true" className="size-2.5" />
              {cell.delta.label}
            </span>
          </div>
        );
      })}
    </section>
  );
}
