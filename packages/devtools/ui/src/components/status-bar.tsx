import { useDevToolsStore } from "../store"
import { useSessionTimer } from "./use-session-timer"

// ── Status Bar ──────────────────────────────────────────────────────────────

export function StatusBar() {
  const {
    connectionStatus, sessions, requests, paused,
    settings, sessionStartedAt,
  } = useDevToolsStore()

  const sessionTime = useSessionTimer(sessionStartedAt)

  const errorCount = requests.filter(
    (r) => r.status === "error" || r.status === "validation_error",
  ).length
  const pendingCount = requests.filter((r) => r.status === "pending").length
  const slowCount = requests.filter(
    (r) => r.timing?.total != null && r.timing.total > settings.slowRequestThreshold,
  ).length

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-border-default bg-surface-0 px-3 text-[11px]">
      <div className="flex items-center gap-3">
        <ConnectionIndicator status={connectionStatus} sessionCount={sessions.length} />
        {paused && <span className="text-amber-400">Paused</span>}
      </div>

      <div className="flex items-center gap-3">
        {sessionTime && (
          <span className="text-text-muted" title="Session duration">{sessionTime}</span>
        )}
        <span className="text-text-muted">{requests.length} requests</span>
        {errorCount > 0 && (
          <span className="text-red-400">
            {errorCount} error{errorCount > 1 ? "s" : ""}
          </span>
        )}
        {slowCount > 0 && (
          <span className="text-amber-400">{slowCount} slow</span>
        )}
        {pendingCount > 0 && (
          <span className="text-sky-400">{pendingCount} pending</span>
        )}
      </div>
    </footer>
  )
}

// ── Connection Indicator ────────────────────────────────────────────────────

function ConnectionIndicator({
  status,
  sessionCount,
}: {
  status: string
  sessionCount: number
}) {
  const dotColor =
    status === "connected"
      ? "bg-emerald-500"
      : status === "reconnecting"
        ? "bg-amber-500 animate-pulse-dot"
        : "bg-zinc-600"

  const label =
    status === "connected"
      ? sessionCount > 0
        ? `${sessionCount} app${sessionCount > 1 ? "s" : ""} connected`
        : "Connected, waiting for apps"
      : status === "reconnecting"
        ? "Reconnecting\u2026"
        : "Disconnected"

  return (
    <div className="flex items-center gap-1.5">
      <div className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      <span className="text-text-muted">{label}</span>
    </div>
  )
}
