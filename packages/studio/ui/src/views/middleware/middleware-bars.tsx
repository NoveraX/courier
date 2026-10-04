import { ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { durationColor } from "./constants";
import type { AggregateMiddleware } from "./types";

// ── Props ──────────────────────────────────────────────────────────────────

interface MiddlewareBarsProps {
  stats: AggregateMiddleware[];
}

const TOP_N = 5;

const BAR_COLORS = [
  "bg-sky-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
] as const;

// ── Component ──────────────────────────────────────────────────────────────

export function MiddlewareBars({ stats }: MiddlewareBarsProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...stats].sort((a, b) => b.avgDuration - a.avgDuration);
  const needsCollapse = sorted.length > TOP_N;
  const visible = needsCollapse && !expanded ? sorted.slice(0, TOP_N) : sorted;
  const maxDuration = Math.max(...sorted.map((s) => s.avgDuration), 0.001);
  const totalDuration = sorted.reduce((s, m) => s + m.avgDuration, 0);

  return (
    <div className="space-y-2.5">
      <h4 className="text-caption text-muted-foreground/70">Time Distribution</h4>
      {visible.map((mw, i) => (
        <Bar
          key={mw.name}
          mw={mw}
          index={i}
          maxDuration={maxDuration}
          totalDuration={totalDuration}
        />
      ))}
      {needsCollapse && (
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="flex items-center gap-1 text-body-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
          {expanded ? "Show less" : `Show ${sorted.length - TOP_N} more`}
        </button>
      )}
    </div>
  );
}

// ── Bar ────────────────────────────────────────────────────────────────────

function Bar({
  mw,
  index,
  maxDuration,
  totalDuration,
}: {
  mw: AggregateMiddleware;
  index: number;
  maxDuration: number;
  totalDuration: number;
}): React.ReactElement {
  const pct = maxDuration > 0 ? (mw.avgDuration / maxDuration) * 100 : 0;
  const share = totalDuration > 0 ? (mw.avgDuration / totalDuration) * 100 : 0;
  const barColor = BAR_COLORS[index % BAR_COLORS.length] ?? BAR_COLORS[0];

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="mono-sm text-foreground">{mw.name}</span>
        <span className={cn("mono-xs tabular-nums", durationColor(mw.avgDuration))}>
          {formatDuration(mw.avgDuration)}
          <span className="ml-1 text-muted-foreground/50">({share.toFixed(0)}%)</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted/20">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(pct, 2)}%` }}
          transition={{ delay: index * 0.06, duration: 0.5, ease: "easeOut" }}
          className={cn("h-full rounded-full", barColor)}
        />
      </div>
    </div>
  );
}
