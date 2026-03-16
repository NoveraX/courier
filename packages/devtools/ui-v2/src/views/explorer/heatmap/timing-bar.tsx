import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDuration } from "@/components/shared/formatters";

import type { PhaseValue } from "./timing-types";

// ── Props ──────────────────────────────────────────────────────────────────

interface TimingBarProps {
  phases: PhaseValue[];
  total: number;
  /** Max total across all rows — used to scale bar width */
  maxTotal: number;
}

// ── Component ──────────────────────────────────────────────────────────────

export function TimingBar({ phases, total, maxTotal }: TimingBarProps): React.ReactElement {
  const scaledWidth = maxTotal > 0 ? (total / maxTotal) * 100 : 0;

  if (phases.length === 0) {
    return (
      <div className="flex h-5 flex-1 items-center">
        <span className="text-[10px] text-muted-foreground/30">No timing data</span>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center gap-2">
      {/* Stacked bar */}
      <div className="h-5 flex-1 overflow-hidden rounded bg-muted/15">
        <div
          className="flex h-full overflow-hidden rounded transition-all duration-300"
          style={{ width: `${Math.max(scaledWidth, 2)}%` }}
        >
          {phases.map((phase) => (
            <Tooltip key={phase.key}>
              <TooltipTrigger asChild>
                <div
                  className={cn(phase.color, "h-full transition-all duration-300 hover:brightness-125")}
                  style={{ width: `${Math.max(phase.pct, 1)}%` }}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-body-xs">
                <span className="text-background font-medium">{phase.label}</span>
                <span className="text-background/60">
                  {" "}{formatDuration(phase.avg)} ({phase.pct.toFixed(1)}%)
                </span>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Total duration label */}
      <span className="w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-foreground/70">
        {formatDuration(total)}
      </span>
    </div>
  );
}
