import type { Settings, TimestampFormat, JsonIndent } from "../../store"
import { SettingsSection, SettingRow, Toggle, Select } from "./section"

// ── Display Settings ────────────────────────────────────────────────────────

const TIMESTAMP_OPTIONS: { value: TimestampFormat; label: string }[] = [
  { value: "relative", label: "Relative (2s ago)" },
  { value: "absolute", label: "Absolute (14:32:05)" },
]

const JSON_INDENT_OPTIONS: { value: JsonIndent; label: string }[] = [
  { value: 2, label: "2 spaces" },
  { value: 4, label: "4 spaces" },
]

export function DisplaySection({
  settings,
  onUpdate,
}: {
  settings: Settings
  onUpdate: (patch: Partial<Settings>) => void
}) {
  return (
    <SettingsSection
      title="Display"
      description="Customize how data is presented"
    >
      <SettingRow
        label="Timestamp format"
        description="How timestamps appear in the timeline"
      >
        <Select
          value={settings.timestampFormat}
          options={TIMESTAMP_OPTIONS}
          onChange={(timestampFormat) => onUpdate({ timestampFormat })}
        />
      </SettingRow>

      <SettingRow
        label="JSON indentation"
        description="Indent size for JSON previews"
      >
        <Select
          value={settings.jsonIndent}
          options={JSON_INDENT_OPTIONS}
          onChange={(v) => onUpdate({ jsonIndent: Number(v) as JsonIndent })}
        />
      </SettingRow>

      <SettingRow
        label="Request body preview"
        description="Show inline body preview in timeline rows"
      >
        <Toggle
          checked={settings.showRequestPreview}
          onChange={(showRequestPreview) => onUpdate({ showRequestPreview })}
        />
      </SettingRow>
    </SettingsSection>
  )
}
