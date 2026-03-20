import { Check, CircleAlert, Loader2 } from "lucide-react";

import type { LucideIcon } from "lucide-react";

// ── Thresholds ─────────────────────────────────────────────────────────────

/** Step is considered slow above this (ms) */
export const SLOW_STEP_MS = 5;

/** Middleware overhead warning threshold (%) */
export const OVERHEAD_WARN_PERCENT = 20;

/** Individual step duration warning (ms) */
export const MAX_DURATION_WARN_MS = 10;

// ── Status icons ───────────────────────────────────────────────────────────

export const STATUS_ICONS: Record<string, LucideIcon> = {
  completed: Check,
  running: Loader2,
  error: CircleAlert,
};

// ── Phase colors ───────────────────────────────────────────────────────────

export const PHASE_COLORS = {
  request: {
    bg: "bg-sky-500/15",
    text: "text-sky-400",
    border: "border-sky-500/30",
    dot: "bg-sky-400",
    label: "before",
  },
  response: {
    bg: "bg-violet-500/15",
    text: "text-violet-400",
    border: "border-violet-500/30",
    dot: "bg-violet-400",
    label: "after",
  },
  wrap: {
    bg: "bg-amber-500/15",
    text: "text-amber-400",
    border: "border-amber-500/30",
    dot: "bg-amber-400",
    label: "wrap",
  },
} as const;

// ── Duration color thresholds ──────────────────────────────────────────────

export function durationColor(ms: number): string {
  if (ms < SLOW_STEP_MS) return "text-emerald-400";
  if (ms < MAX_DURATION_WARN_MS) return "text-amber-400";
  return "text-rose-400";
}

export function durationBg(ms: number): string {
  if (ms < SLOW_STEP_MS) return "bg-emerald-500/20";
  if (ms < MAX_DURATION_WARN_MS) return "bg-amber-500/20";
  return "bg-rose-500/20";
}
