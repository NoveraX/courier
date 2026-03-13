import type { RequestStatus } from "../../store"

// ── Row ─────────────────────────────────────────────────────────────────────

/** Estimated height of a request row in pixels (for virtualizer) */
export const ROW_HEIGHT = 40

// ── Timing Thresholds (ms) ──────────────────────────────────────────────────

export const TIMING_SLOW_MS = 500
export const TIMING_WARN_MS = 100

// ── Status Config ────────────────────────────────────────────────────────────

export const STATUS_CONFIG: Record<
  RequestStatus,
  { color: string; label: string; dotClass: string }
> = {
  pending: {
    color: "text-sky-400",
    label: "Pending",
    dotClass: "bg-sky-400 animate-pulse-dot",
  },
  success: {
    color: "text-emerald-400",
    label: "Success",
    dotClass: "bg-emerald-400",
  },
  error: {
    color: "text-red-400",
    label: "Error",
    dotClass: "bg-red-400",
  },
  aborted: {
    color: "text-zinc-400",
    label: "Aborted",
    dotClass: "bg-zinc-400",
  },
  validation_error: {
    color: "text-orange-400",
    label: "Validation",
    dotClass: "bg-orange-400",
  },
}

// ── HTTP Status Code Colors ──────────────────────────────────────────────────

export const CODE_COLORS: Record<string, string> = {
  "2": "text-emerald-400",
  "3": "text-amber-400",
  "4": "text-red-400",
  "5": "text-red-500",
}

// ── HTTP Method Colors ───────────────────────────────────────────────────────

export const HTTP_METHOD_COLORS: Record<string, string> = {
  GET: "text-emerald-400",
  POST: "text-sky-400",
  PUT: "text-amber-400",
  PATCH: "text-orange-400",
  DELETE: "text-red-400",
  HEAD: "text-violet-400",
  OPTIONS: "text-zinc-400",
}

export function getCodeColor(statusCode: number): string {
  return CODE_COLORS[String(statusCode)[0]!] ?? "text-muted-foreground"
}
