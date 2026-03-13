import { toast } from "sonner"

import type { DevToolsState } from "./store-types"
import type { RequestEntry, Settings } from "./types"

type EventPayload = Record<string, unknown>
type Getter = () => DevToolsState

// ── Event-driven Sonner notifications ───────────────────────────────────────

export function notifyOnEvent(event: EventPayload, get: Getter): void {
  const { settings, requests } = get()

  if (event.type === "request:error") {
    notifyError(event, settings, requests)
  }

  if (event.type === "request:end") {
    notifySlowRequest(event, settings, requests)
  }
}

function resolveLabel(event: EventPayload, requests: RequestEntry[]): string {
  const requestId = String(event.requestId ?? "")
  const entry = requests.find((r) => r.id === requestId)
  if (entry) {
    return [entry.source, entry.group, entry.method].filter(Boolean).join(".")
  }
  return String(event.method ?? "unknown")
}

function notifyError(
  event: EventPayload,
  settings: Settings,
  requests: RequestEntry[],
): void {
  if (!settings.toastOnError) return
  const label = resolveLabel(event, requests)
  toast.error(`Request failed: ${label}`)
}

function notifySlowRequest(
  event: EventPayload,
  settings: Settings,
  requests: RequestEntry[],
): void {
  if (!settings.toastOnSlowRequest) return
  const timing = event.timing as { total?: number } | undefined
  if (timing?.total == null || timing.total <= settings.slowRequestThreshold) return

  const label = resolveLabel(event, requests)
  const ms = Math.round(timing.total)
  toast.warning(`Slow request: ${label} (${ms}ms)`)
}
