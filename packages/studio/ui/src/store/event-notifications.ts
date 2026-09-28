import { toast } from "sonner"

import type { StudioState } from "./store-types"
import type { RequestEntry } from "./types"

type EventPayload = Record<string, unknown>
type Getter = () => StudioState

// ── Event-driven Sonner notifications ───────────────────────────────────────

/**
 * Toast the failures and slow requests among a batch of events the store
 * just took in. A burst that fails many requests at once is told in one
 * toast, not one per request.
 *
 * @param events - The events of the batch, oldest first
 * @param get - Reads the store after the batch was applied
 *
 * @example
 * ```ts
 * notifyOnEvents(batch, get)
 * ```
 */
export function notifyOnEvents(events: EventPayload[], get: Getter): void {
  const { settings, requests } = get()
  const failed = settings.toastOnError ? events.filter((e) => e.type === "request:error") : []
  const slow = settings.toastOnSlowRequest
    ? events.filter((e) => e.type === "request:end" && totalOf(e) > settings.slowRequestThreshold)
    : []
  if (failed.length === 0 && slow.length === 0) return

  const labelOf = labeller(requests)
  if (failed.length > 0) notifyFailed(failed, labelOf)
  for (const event of slow.slice(-MAX_SLOW_TOASTS)) notifySlowRequest(event, labelOf)
}

/** A burst of slow requests is told by its latest few. */
const MAX_SLOW_TOASTS = 3

function totalOf(event: EventPayload): number {
  const timing = event.timing as { total?: number } | undefined
  return typeof timing?.total === "number" ? timing.total : -1
}

function labeller(requests: RequestEntry[]): (event: EventPayload) => string {
  const byId = new Map(requests.map((r) => [r.id, r]))
  return (event) => {
    const entry = byId.get(String(event.requestId ?? ""))
    if (entry) return [entry.source, entry.group, entry.method].filter(Boolean).join(".")
    return String(event.method ?? "unknown")
  }
}

function notifyFailed(failed: EventPayload[], labelOf: (event: EventPayload) => string): void {
  const latest = labelOf(failed[failed.length - 1]!)
  if (failed.length === 1) toast.error(`Request failed: ${latest}`)
  else toast.error(`${failed.length} requests failed, the latest ${latest}`)
}

function notifySlowRequest(event: EventPayload, labelOf: (event: EventPayload) => string): void {
  const ms = Math.round(totalOf(event))
  const message = `Slow request: ${labelOf(event)} (${ms}ms)`

  // Match request-row color: >1s = red (error), >threshold = yellow (warning)
  if (ms > 1000) {
    toast.error(message)
  } else {
    toast.warning(message)
  }
}
