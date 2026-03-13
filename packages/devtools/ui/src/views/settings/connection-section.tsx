import type { Settings } from "../../store"
import { SettingsSection, SettingRow, Toggle, NumberInput } from "./section"

// ── Connection Settings ────────────────────────────────────────────────────

export function ConnectionSection({
  settings,
  onUpdate,
}: {
  settings: Settings
  onUpdate: (patch: Partial<Settings>) => void
}) {
  return (
    <SettingsSection
      title="Connection"
      description="Socket.IO reconnection behavior"
    >
      <SettingRow
        label="Auto-reconnect"
        description="Automatically reconnect when the connection drops"
      >
        <Toggle
          checked={settings.autoReconnect}
          onChange={(autoReconnect) => onUpdate({ autoReconnect })}
        />
      </SettingRow>

      <SettingRow
        label="Reconnect delay"
        description="Initial delay before reconnection attempt (ms)"
      >
        <NumberInput
          value={settings.reconnectDelay}
          onChange={(reconnectDelay) => onUpdate({ reconnectDelay })}
          min={500}
          max={10000}
          step={500}
        />
      </SettingRow>
    </SettingsSection>
  )
}
