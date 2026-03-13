import type { Settings } from "../../store"
import { SettingsSection, SettingRow, Toggle, NumberInput } from "./section"

// ── Recording Settings ──────────────────────────────────────────────────────

export function RecordingSection({
  settings,
  onUpdate,
}: {
  settings: Settings
  onUpdate: (patch: Partial<Settings>) => void
}) {
  return (
    <SettingsSection
      title="Recording"
      description="Control how requests are captured and stored"
    >
      <SettingRow
        label="Max requests"
        description="Maximum number of requests kept in memory"
      >
        <NumberInput
          value={settings.maxRequests}
          onChange={(maxRequests) => onUpdate({ maxRequests })}
          min={100}
          max={10000}
          step={100}
        />
      </SettingRow>

      <SettingRow
        label="Preserve log"
        description="Keep request log when an app disconnects"
      >
        <Toggle
          checked={settings.preserveLog}
          onChange={(preserveLog) => onUpdate({ preserveLog })}
        />
      </SettingRow>
    </SettingsSection>
  )
}
