import type { DevToolsState } from "./store-types"
import type { RequestEntry, Settings } from "./types"

type EventPayload = Record<string, unknown>
type Getter = () => DevToolsState

// ── Event-driven toast notifications ────────────────────────────────────────

export function notifyOnEvent(event: EventPayload, get: Getter): void {
  const { settings, showToast, requests } = get()

  if (event.type === "request:error") {
    notifyError(event, settings, showToast, requests)
  }

  if (event.type === "request:end") {
    notifySlowRequest(event, settings, showToast, requests)
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
  showToast: DevToolsState["showToast"],
  requests: RequestEntry[],
): void {
  if (!settings.toastOnError) return
  const label = resolveLabel(event, requests)
  showToast(`Request failed: ${label}`, "error")
}

function notifySlowRequest(
  event: EventPayload,
  settings: Settings,
  showToast: DevToolsState["showToast"],
  requests: RequestEntry[],
): void {
  if (!settings.toastOnSlowRequest) return
  const timing = event.timing as { total?: number } | undefined
  if (timing?.total == null || timing.total <= settings.slowRequestThreshold) return

  const label = resolveLabel(event, requests)
  const ms = Math.round(timing.total)
  showToast(`Slow request: ${label} (${ms}ms)`, "info")
}
