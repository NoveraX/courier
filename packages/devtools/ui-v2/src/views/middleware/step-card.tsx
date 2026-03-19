import { motion } from "motion/react";

import { cn } from "@/lib/utils";
import { formatDuration } from "@/components/shared/formatters";
import { Badge } from "@/components/ui/badge";

import type { MiddlewareStep } from "./types";
import { STATUS_ICONS, PHASE_COLORS, durationColor, durationBg } from "./constants";
import { isSlowStep } from "./helpers";

// ── Props ──────────────────────────────────────────────────────────────────

interface StepCardProps {
  step: MiddlewareStep;
  maxDuration: number;
  index: number;
  /** Which side of the pipeline this card is on (for wrap middleware shown twice) */
  subPhase?: "before" | "after";
}

// ── Component ──────────────────────────────────────────────────────────────

export function StepCard({
  step,
  maxDuration,
  index,
  subPhase,
}: StepCardProps): React.ReactElement {
  // For wrap middleware, show the sub-phase color when displayed on a specific side
  const phaseKey = step.phase === "wrap" && subPhase
    ? (subPhase === "before" ? "request" : "response")
    : step.phase;
  const phase = PHASE_COLORS[phaseKey];
  const StatusIcon = STATUS_ICONS[step.status];
  const duration = displayDuration(step, subPhase);
  const slow = isSlowStep(duration);
  const barWidth = maxDuration > 0 ? (duration / maxDuration) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25, ease: "easeOut" }}
      className={cn(
        "relative rounded-lg border bg-card/60 px-3.5 py-2.5 backdrop-blur-sm transition-colors",
        step.status === "error"
          ? "border-rose-500/40"
          : slow
            ? "border-amber-500/30 shadow-[0_0_12px_-3px] shadow-amber-500/15"
            : "border-border-subtle",
      )}
    >
      <div className="flex items-center gap-2.5">
        {/* Index badge */}
        <span className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold",
          phase.bg, phase.text,
        )}>
          {step.index + 1}
        </span>

        {/* Name */}
        <span className="min-w-0 flex-1 truncate mono-sm font-medium text-foreground">
          {step.name}
        </span>

        {/* Phase label — show actual declared phase, colored by sub-phase */}
        <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0", phase.border, phase.text)}>
          {PHASE_COLORS[step.phase].label}
        </Badge>

        {/* Status icon */}
        {StatusIcon && (
          <StatusIcon
            className={cn(
              "size-3.5 shrink-0",
              step.status === "completed" && "text-emerald-400",
              step.status === "error" && "text-rose-400",
              step.status === "running" && "animate-spin text-amber-400",
            )}
          />
        )}

        {/* Duration — show sub-phase time for wrap middleware */}
        <span className={cn("mono-sm shrink-0 tabular-nums", durationColor(displayDuration(step, subPhase)))}>
          {formatDuration(displayDuration(step, subPhase))}
        </span>
      </div>

      {/* Duration bar */}
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted/20">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${barWidth}%` }}
          transition={{ delay: index * 0.05 + 0.15, duration: 0.4, ease: "easeOut" }}
          className={cn("h-full rounded-full", durationBg(duration))}
        />
      </div>

      {/* Error message */}
      {step.error && (
        <p className="mt-1.5 text-body-xs leading-tight text-rose-400/90">
          {step.error}
        </p>
      )}

      {/* Headers added */}
      {step.headersAdded && step.headersAdded.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground/50">headers:</span>
          <span className="mono-xs truncate text-muted-foreground">
            {step.headersAdded.join(", ")}
          </span>
        </div>
      )}
    </motion.div>
  );
}

/** Show sub-phase duration for wrap middleware, total for single-phase */
function displayDuration(step: MiddlewareStep, subPhase?: "before" | "after"): number {
  if (step.phase !== "wrap" || !subPhase) return step.duration;
  if (subPhase === "before") return step.beforeDuration ?? step.duration;
  return step.afterDuration ?? 0;
}
