import type { Method } from "@/site/studio-landing/hero/traffic"

/** A phase of a call, by the colour the waterfall gives it. */
export type PhaseTone =
  | "proxy"
  | "middleware"
  | "fetch"
  | "validation"
  | "middleware-out"
  | "proxy-out"

/** A call in the waterfall: when it starts, how long it takes, and its phases' shares. */
export interface WaterfallRow {
  method: Method
  endpoint: string
  startMs: number
  durationMs: number
  phases: readonly { tone: PhaseTone; share: number }[]
}

/** The stretch of time the waterfall spans, as its axis marks it. */
export const WATERFALL_SPAN_MS = 750

const DIRECT = [
  { tone: "middleware", share: 0.08 },
  { tone: "fetch", share: 0.78 },
  { tone: "validation", share: 0.06 },
  { tone: "middleware-out", share: 0.08 },
] as const

const PROXIED = [
  { tone: "proxy", share: 0.1 },
  { tone: "middleware", share: 0.08 },
  { tone: "fetch", share: 0.62 },
  { tone: "validation", share: 0.06 },
  { tone: "middleware-out", share: 0.06 },
  { tone: "proxy-out", share: 0.08 },
] as const

/**
 * A page load's calls as the waterfall shows them: the token refresh
 * first, the reads it unblocks overlapping, then two proxied writes.
 *
 * @example
 * ```ts
 * WATERFALL_ROWS[0].endpoint // "auth.refresh"
 * ```
 */
export const WATERFALL_ROWS: readonly WaterfallRow[] = [
  { method: "POST", endpoint: "auth.refresh", startMs: 0, durationMs: 36, phases: DIRECT },
  { method: "GET", endpoint: "users.get", startMs: 40, durationMs: 44, phases: DIRECT },
  { method: "GET", endpoint: "orders.list", startMs: 88, durationMs: 120, phases: DIRECT },
  { method: "GET", endpoint: "features.eval", startMs: 92, durationMs: 14, phases: DIRECT },
  { method: "GET", endpoint: "inbox.list", startMs: 96, durationMs: 52, phases: DIRECT },
  { method: "POST", endpoint: "charges.create", startMs: 210, durationMs: 380, phases: PROXIED },
  { method: "GET", endpoint: "rates.quote", startMs: 214, durationMs: 420, phases: PROXIED },
]
