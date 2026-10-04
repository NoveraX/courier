import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { formatDiffPercent } from "./helpers";
import type { TimingComparison } from "./types";

interface TimingDiffProps {
  comparisons: TimingComparison[];
}

export function TimingDiffView({ comparisons }: TimingDiffProps): React.ReactElement {
  if (comparisons.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <p className="text-body-sm text-muted-foreground">No timing data to compare</p>
      </div>
    );
  }

  const maxMs = Math.max(...comparisons.flatMap((c) => [c.leftMs, c.rightMs]), 1);

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-1 p-4">
        {comparisons.map((c) => (
          <TimingRow key={c.phase} comparison={c} maxMs={maxMs} />
        ))}

        {/* Total diff summary */}
        <TotalSummary comparisons={comparisons} />
      </div>
    </ScrollArea>
  );
}

// ── Single timing row ───────────────────────────────────────────────────────

function TimingRow({
  comparison,
  maxMs,
}: {
  comparison: TimingComparison;
  maxMs: number;
}): React.ReactElement {
  const leftPct = (comparison.leftMs / maxMs) * 100;
  const rightPct = (comparison.rightMs / maxMs) * 100;
  const isFaster = comparison.diffMs < 0;
  const isSlower = comparison.diffMs > 0;

  return (
    <div className="rounded-lg border border-border-subtle/50 bg-card/50 p-3">
      {/* Phase label + diff */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-body-sm font-medium text-foreground">{comparison.phase}</span>
        {comparison.diffMs !== 0 && (
          <span
            className={cn(
              "font-mono text-[11px] font-medium",
              isFaster && "text-emerald-400",
              isSlower && "text-rose-400",
            )}
          >
            {comparison.diffMs > 0 ? "+" : ""}
            {formatDuration(Math.abs(comparison.diffMs))}{" "}
            <span className="text-[10px] opacity-70">
              ({formatDiffPercent(comparison.diffPercent)})
            </span>
          </span>
        )}
      </div>

      {/* Left bar */}
      <div className="mb-1 flex items-center gap-2">
        <span className="w-10 shrink-0 text-right text-[10px] text-muted-foreground/60">Left</span>
        <div className="relative h-5 min-w-0 flex-1 overflow-hidden rounded bg-muted/30">
          <div
            className="absolute inset-y-0 left-0 rounded bg-accent-brand/30 transition-all"
            style={{ width: `${Math.max(leftPct, 0.5)}%` }}
          />
          <span className="relative z-10 flex h-full items-center px-2 font-mono text-[10px] text-foreground/80">
            {formatDuration(comparison.leftMs)}
          </span>
        </div>
      </div>

      {/* Right bar */}
      <div className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-right text-[10px] text-muted-foreground/60">Right</span>
        <div className="relative h-5 min-w-0 flex-1 overflow-hidden rounded bg-muted/30">
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded transition-all",
              isFaster ? "bg-emerald-500/30" : isSlower ? "bg-rose-500/30" : "bg-accent-brand/30",
            )}
            style={{ width: `${Math.max(rightPct, 0.5)}%` }}
          />
          <span className="relative z-10 flex h-full items-center px-2 font-mono text-[10px] text-foreground/80">
            {formatDuration(comparison.rightMs)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Total summary ───────────────────────────────────────────────────────────

function TotalSummary({ comparisons }: { comparisons: TimingComparison[] }): React.ReactNode {
  const totalEntry = comparisons.find((c) => c.phase === "Total");
  if (!totalEntry) return null;

  const isFaster = totalEntry.diffMs < 0;
  const isSlower = totalEntry.diffMs > 0;

  return (
    <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-2.5">
      <span className="text-body-sm font-medium text-foreground">Overall Difference</span>
      <span
        className={cn(
          "font-mono text-sm font-semibold",
          isFaster && "text-emerald-400",
          isSlower && "text-rose-400",
          !isFaster && !isSlower && "text-muted-foreground",
        )}
      >
        {totalEntry.diffMs === 0
          ? "Identical"
          : `${isSlower ? "+" : ""}${formatDuration(Math.abs(totalEntry.diffMs))} (${formatDiffPercent(totalEntry.diffPercent)})`}
      </span>
    </div>
  );
}
