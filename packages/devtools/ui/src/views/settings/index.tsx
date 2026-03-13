import { RotateCcw } from "lucide-react"

import { useDevToolsStore } from "../../store"
import { ConnectionSection } from "./connection-section"
import { RecordingSection } from "./recording-section"
import { DisplaySection } from "./display-section"
import { NotificationsSection } from "./notifications-section"
import { CodegenSection } from "./codegen-section"
import { SessionHistorySection } from "./session-history-section"

// ── Settings View ───────────────────────────────────────────────────────────

export function SettingsView() {
  const { settings, updateSettings, resetSettings, showToast } = useDevToolsStore()

  function handleReset() {
    resetSettings()
    showToast("Settings reset to defaults", "success")
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-default px-4 py-2.5">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Settings</h2>
          <p className="text-[11px] text-text-muted">
            Preferences are saved automatically to localStorage
          </p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1.5 rounded-md border border-border-default px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-1"
        >
          <RotateCcw size={12} />
          Reset to defaults
        </button>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <ConnectionSection settings={settings} onUpdate={updateSettings} />
        <RecordingSection settings={settings} onUpdate={updateSettings} />
        <DisplaySection settings={settings} onUpdate={updateSettings} />
        <NotificationsSection settings={settings} onUpdate={updateSettings} />
        <CodegenSection settings={settings} onUpdate={updateSettings} />
        <SessionHistorySection />

        {/* Version info */}
        <div className="pt-2 text-center text-[10px] text-text-muted">
          Nexus DevTools &middot; Settings stored in localStorage
        </div>
      </div>
    </div>
  )
}
