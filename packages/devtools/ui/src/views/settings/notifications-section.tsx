import type { Settings } from "../../store"
import { SettingsSection, SettingRow, Toggle, NumberInput } from "./section"

// ── Notifications Settings ──────────────────────────────────────────────────

export function NotificationsSection({
  settings,
  onUpdate,
}: {
  settings: Settings
  onUpdate: (patch: Partial<Settings>) => void
}) {
  return (
    <SettingsSection
      title="Notifications"
      description="Configure toast alerts and status bar indicators"
    >
      <SettingRow
        label="Toast on error"
        description="Show a toast notification when a request fails"
      >
        <Toggle
          checked={settings.toastOnError}
          onChange={(toastOnError) => onUpdate({ toastOnError })}
        />
      </SettingRow>

      <SettingRow
        label="Toast on slow request"
        description="Show a toast when a request exceeds the threshold"
      >
        <Toggle
          checked={settings.toastOnSlowRequest}
          onChange={(toastOnSlowRequest) => onUpdate({ toastOnSlowRequest })}
        />
      </SettingRow>

      <SettingRow
        label="Slow request threshold"
        description="Requests slower than this are flagged (ms)"
      >
        <NumberInput
          value={settings.slowRequestThreshold}
          onChange={(slowRequestThreshold) => onUpdate({ slowRequestThreshold })}
          min={100}
          max={30000}
          step={100}
        />
      </SettingRow>
    </SettingsSection>
  )
}
