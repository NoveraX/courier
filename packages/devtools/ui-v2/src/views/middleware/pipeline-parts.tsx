import { motion } from "motion/react";
import { Globe } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDuration } from "@/components/shared/formatters";

import { OVERHEAD_WARN_PERCENT } from "./constants";

// ── Animated connector ─────────────────────────────────────────────────────

export function Connector({ delay }: { delay: number }): React.ReactElement {
  return (
    <motion.svg
      width="2"
      height="24"
      className="shrink-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.2 }}
    >
      <motion.line
        x1="1" y1="0" x2="1" y2="24"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        className="text-border"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay, duration: 0.3, ease: "easeOut" }}
      />
    </motion.svg>
  );
}

// ── Fetch boundary node ────────────────────────────────────────────────────

export function FetchNode({ delay }: { delay: number }): React.ReactElement {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.25, ease: "easeOut" }}
      className="flex items-center gap-2 rounded-lg border border-accent-brand/30 bg-accent-brand/10 px-4 py-2 shadow-[0_0_16px_-4px] shadow-accent-brand/20"
    >
      <Globe className="size-4 text-accent-brand" />
      <span className="text-body-sm font-medium text-accent-brand">
        HTTP Fetch
      </span>
    </motion.div>
  );
}

// ── Phase label ────────────────────────────────────────────────────────────

export function PhaseLabel({ label, delay }: { label: string; delay: number }): React.ReactElement {
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.2 }}
      className="text-caption text-muted-foreground/60"
    >
      {label}
    </motion.span>
  );
}

// ── Overhead summary ───────────────────────────────────────────────────────

export function OverheadSummary({
  overhead,
  percent,
  delay,
}: {
  overhead: number;
  percent: number;
  delay: number;
}): React.ReactElement {
  const isWarn = percent > OVERHEAD_WARN_PERCENT;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.3 }}
      className="mt-6 flex items-center gap-2.5 text-muted-foreground/50"
    >
      <div className="h-px flex-1 bg-border-subtle/40" />
      <span className="text-[10px] uppercase tracking-widest">overhead</span>
      <span className={cn(
        "mono-sm font-medium tabular-nums",
        isWarn ? "text-amber-400" : "text-emerald-400",
      )}>
        {formatDuration(overhead)}
      </span>
      <span className="text-[10px] tabular-nums">
        {percent.toFixed(1)}%
      </span>
      <div className="h-px flex-1 bg-border-subtle/40" />
    </motion.div>
  );
}
