import { useState } from "react"
import { Save, Archive } from "lucide-react"

import { useDevToolsStore } from "../../store"
import { SettingsSection } from "./section"
import { SessionCard } from "./session-card"
import { useSessionHistory } from "./use-session-history"

// ── Session History Section ────────────────────────────────────────────────

export function SessionHistorySection() {
  const { sessions, loading, remove, save, exportSession } = useSessionHistory()
  const { requests, sessions: appSessions, showToast } = useDevToolsStore()
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const apps = appSessions.map((s) => ({
      sessionId: s.sessionId,
      framework: s.framework,
      nexusVersion: s.nexusVersion,
      connectedAt: s.connectedAt,
    }))
    const result = await save(requests, apps)
    setSaving(false)
    if (result) {
      showToast(`Session saved: ${result.name}`, "success")
    } else {
      showToast("Failed to save session", "error")
    }
  }

  return (
    <SettingsSection
      title="Session History"
      description="Save and load captured request sessions"
    >
      {/* Save current session */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-text-secondary">Current session</p>
          <p className="text-[11px] text-text-muted">
            {requests.length} request{requests.length !== 1 ? "s" : ""} captured
          </p>
        </div>
        <button
          type="button"
          disabled={requests.length === 0 || saving}
          onClick={handleSave}
          className="flex items-center gap-1.5 rounded-md bg-indigo-500/15 px-2.5 py-1.5 text-xs font-medium text-indigo-400 transition-colors hover:bg-indigo-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Save size={12} />
          {saving ? "Saving\u2026" : "Save Session"}
        </button>
      </div>

      {/* Divider */}
      <div className="border-t border-border-subtle" />

      {/* Saved sessions list */}
      {loading ? (
        <p className="py-2 text-center text-[11px] text-text-muted">Loading\u2026</p>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-4 text-text-muted">
          <Archive size={20} strokeWidth={1} />
          <p className="text-[11px]">No saved sessions yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onDelete={async () => {
                const ok = await remove(session.id)
                showToast(ok ? "Session deleted" : "Delete failed", ok ? "info" : "error")
              }}
              onExport={exportSession}
            />
          ))}
        </div>
      )}
    </SettingsSection>
  )
}
