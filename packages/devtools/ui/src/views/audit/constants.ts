import { AlertCircle, AlertTriangle, Lightbulb, CheckCircle2 } from "lucide-react"

import type { AuditSeverity } from "./types"

export const P95_THRESHOLD_MS = 1000
export const ERROR_RATE_THRESHOLD = 0.3
export const MIN_SAMPLES_FOR_P95 = 3
export const MIN_CALLS_FOR_CACHE_HINT = 5
export const LARGE_PAYLOAD_BYTES = 1_048_576 // 1MB
export const LARGE_GROUP_ENDPOINT_COUNT = 10

export const SEVERITY_CONFIG: Record<
  AuditSeverity,
  { icon: typeof AlertCircle; color: string; bgColor: string; label: string }
> = {
  error: {
    icon: AlertCircle,
    color: "text-red-400",
    bgColor: "bg-red-500/10 border-red-500/20",
    label: "Error",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/20",
    label: "Warning",
  },
  hint: {
    icon: Lightbulb,
    color: "text-sky-400",
    bgColor: "bg-sky-500/10 border-sky-500/20",
    label: "Hint",
  },
  pass: {
    icon: CheckCircle2,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10 border-emerald-500/20",
    label: "Pass",
  },
}
