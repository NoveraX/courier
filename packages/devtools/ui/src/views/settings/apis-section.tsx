import type { Settings, ValidationLib, ApisGroupBy, ApisClient } from "../../store"
import { SettingsSection, SettingRow, Toggle, Select } from "./section"

// ── Apis Default Settings ───────────────────────────────────────────────

const VALIDATION_OPTIONS: { value: ValidationLib; label: string }[] = [
  { value: "zod", label: "Zod" },
  { value: "valibot", label: "Valibot" },
  { value: "arktype", label: "ArkType" },
  { value: "none", label: "None" },
]

const GROUP_BY_OPTIONS: { value: ApisGroupBy; label: string }[] = [
  { value: "tag", label: "By tag" },
  { value: "path", label: "By path prefix" },
  { value: "single", label: "Single group" },
]

const CLIENT_OPTIONS: { value: ApisClient; label: string }[] = [
  { value: "direct", label: "Direct" },
  { value: "proxy", label: "Proxy" },
  { value: "both", label: "Both" },
  { value: "none", label: "None" },
]

export function ApisSection({
  settings,
  onUpdate,
}: {
  settings: Settings
  onUpdate: (patch: Partial<Settings>) => void
}) {
  return (
    <SettingsSection
      title="API Defaults"
      description="Default options for OpenAPI code generation"
      defaultOpen={false}
    >
      <SettingRow
        label="Validation library"
        description="Schema validation library for generated code"
      >
        <Select
          value={settings.apisValidation}
          options={VALIDATION_OPTIONS}
          onChange={(apisValidation) => onUpdate({ apisValidation })}
        />
      </SettingRow>

      <SettingRow
        label="Group by"
        description="How endpoints are grouped into files"
      >
        <Select
          value={settings.apisGroupBy}
          options={GROUP_BY_OPTIONS}
          onChange={(apisGroupBy) => onUpdate({ apisGroupBy })}
        />
      </SettingRow>

      <SettingRow
        label="Client mode"
        description="Generated client type (direct, proxy, or both)"
      >
        <Select
          value={settings.apisClient}
          options={CLIENT_OPTIONS}
          onChange={(apisClient) => onUpdate({ apisClient })}
        />
      </SettingRow>

      <SettingRow
        label="Generate types"
        description="Generate TypeScript type definitions"
      >
        <Toggle
          checked={settings.apisGenerateTypes}
          onChange={(apisGenerateTypes) => onUpdate({ apisGenerateTypes })}
        />
      </SettingRow>

      <SettingRow
        label="Generate schemas"
        description="Generate runtime validation schemas"
      >
        <Toggle
          checked={settings.apisGenerateSchemas}
          onChange={(apisGenerateSchemas) => onUpdate({ apisGenerateSchemas })}
        />
      </SettingRow>

      <SettingRow
        label="Include comments"
        description="Add JSDoc from OpenAPI descriptions"
      >
        <Toggle
          checked={settings.apisIncludeComments}
          onChange={(apisIncludeComments) => onUpdate({ apisIncludeComments })}
        />
      </SettingRow>
    </SettingsSection>
  )
}
