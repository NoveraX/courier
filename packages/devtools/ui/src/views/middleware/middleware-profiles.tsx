import { motion } from "motion/react";
import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDuration } from "@/components/shared/formatters";

import type { AggregateMiddleware } from "./types";
import { durationColor, durationBg } from "./constants";

// ── Props ──────────────────────────────────────────────────────────────────

interface MiddlewareProfilesProps {
  stats: AggregateMiddleware[];
  onSelect: (name: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function MiddlewareProfiles({
  stats,
  onSelect,
}: MiddlewareProfilesProps): React.ReactElement {
  const maxAvg = Math.max(...stats.map((s) => s.avgDuration), 0.001);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((mw, i) => (
        <ProfileCard key={mw.name} mw={mw} maxAvg={maxAvg} index={i} onClick={() => onSelect(mw.name)} />
      ))}
    </div>
  );
}

// ── Profile card ───────────────────────────────────────────────────────────

function ProfileCard({
  mw,
  maxAvg,
  index,
  onClick,
}: {
  mw: AggregateMiddleware;
  maxAvg: number;
  index: number;
  onClick: () => void;
}): React.ReactElement {
  const barPct = maxAvg > 0 ? (mw.avgDuration / maxAvg) * 100 : 0;
  const hasErrors = mw.errors > 0;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
      className={cn(
        "group flex flex-col gap-3 rounded-xl border bg-card p-4 text-left transition-all",
        "hover:border-border hover:bg-card-elevated hover:shadow-sm",
        hasErrors ? "border-rose-500/30" : "border-border-subtle",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="mono-sm font-semibold text-foreground">{mw.name}</span>
        <div className="flex items-center gap-1.5">
          {hasErrors && <AlertCircle className="size-3 text-rose-400" />}
          <span className="rounded bg-muted/40 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {mw.calls} calls
          </span>
        </div>
      </div>

      {/* Duration bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/20">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(barPct, 3)}%` }}
          transition={{ delay: index * 0.05 + 0.15, duration: 0.4, ease: "easeOut" }}
          className={cn("h-full rounded-full", durationBg(mw.avgDuration))}
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Avg" value={mw.avgDuration} />
        <Stat label="P95" value={mw.p95Duration} />
        <Stat label="Max" value={mw.maxDuration} />
      </div>
    </motion.button>
  );
}

// ── Stat cell ──────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <div>
      <span className="text-[10px] text-muted-foreground/50">{label}</span>
      <div className={cn("mono-xs tabular-nums", durationColor(value))}>
        {formatDuration(value)}
      </div>
    </div>
  );
}
