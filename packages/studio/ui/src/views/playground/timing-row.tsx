import { formatDuration } from "@/components/shared/formatters";
import { cn } from "@/lib/utils";

import type { RequestTiming } from "@/store/types-events";

// ── Config ─────────────────────────────────────────────────────────────────

const SEGMENTS: { key: keyof RequestTiming; label: string; color: string }[] = [
  { key: "middleware", label: "Middleware", color: "bg-violet-500" },
  { key: "validation", label: "Validation", color: "bg-amber-500" },
  { key: "fetch", label: "Fetch", color: "bg-sky-500" },
];

// ── Component ──────────────────────────────────────────────────────────────

interface TimingRowProps {
  timing: RequestTiming;
  className?: string;
}

export function TimingRow({ timing, className }: TimingRowProps): React.ReactElement {
  const total = timing.total || 1;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Stacked bar */}
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted/20">
        {SEGMENTS.map(({ key, color }) => {
          const pct = (timing[key] / total) * 100;
          if (pct < 0.5) return null;
          return (
            <div
              key={key}
              className={cn("h-full transition-all duration-500", color)}
              style={{ width: `${pct}%` }}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3">
        {SEGMENTS.map(({ key, label, color }) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={cn("size-2 rounded-full", color)} />
            <span className="text-[10px] text-muted-foreground">{label}</span>
            <span className="text-[10px] tabular-nums text-foreground/70">
              {formatDuration(timing[key])}
            </span>
          </div>
        ))}
        <div className="flex-1" />
        <span className="text-[10px] font-medium tabular-nums text-foreground">
          Total {formatDuration(timing.total)}
        </span>
      </div>
    </div>
  );
}
