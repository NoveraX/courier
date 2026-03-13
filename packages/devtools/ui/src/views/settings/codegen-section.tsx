import type { Settings, ValidationLib, CodegenGroupBy, CodegenClient } from "../../store"
import { SettingsSection, SettingRow, Toggle, Select } from "./section"

// ── Codegen Default Settings ───────────────────────────────────────────────

const VALIDATION_OPTIONS: { value: ValidationLib; label: string }[] = [
  { value: "zod", label: "Zod" },
  { value: "valibot", label: "Valibot" },
  { value: "arktype", label: "ArkType" },
  { value: "none", label: "None" },
]

const GROUP_BY_OPTIONS: { value: CodegenGroupBy; label: string }[] = [
  { value: "tag", label: "By tag" },
  { value: "path", label: "By path prefix" },
  { value: "single", label: "Single group" },
]

const CLIENT_OPTIONS: { value: CodegenClient; label: string }[] = [
  { value: "direct", label: "Direct" },
  { value: "proxy", label: "Proxy" },
  { value: "both", label: "Both" },
  { value: "none", label: "None" },
]

export function CodegenSection({
  settings,
  onUpdate,
}: {
  settings: Settings
  onUpdate: (patch: Partial<Settings>) => void
}) {
  return (
    <SettingsSection
      title="Codegen Defaults"
      description="Default options for OpenAPI code generation"
      defaultOpen={false}
    >
      <SettingRow
        label="Validation library"
        description="Schema validation library for generated code"
      >
        <Select
          value={settings.codegenValidation}
          options={VALIDATION_OPTIONS}
          onChange={(codegenValidation) => onUpdate({ codegenValidation })}
        />
      </SettingRow>

      <SettingRow
        label="Group by"
        description="How endpoints are grouped into files"
      >
        <Select
          value={settings.codegenGroupBy}
          options={GROUP_BY_OPTIONS}
          onChange={(codegenGroupBy) => onUpdate({ codegenGroupBy })}
        />
      </SettingRow>

      <SettingRow
        label="Client mode"
        description="Generated client type (direct, proxy, or both)"
      >
        <Select
          value={settings.codegenClient}
          options={CLIENT_OPTIONS}
          onChange={(codegenClient) => onUpdate({ codegenClient })}
        />
      </SettingRow>

      <SettingRow
        label="Generate types"
        description="Generate TypeScript type definitions"
      >
        <Toggle
          checked={settings.codegenGenerateTypes}
          onChange={(codegenGenerateTypes) => onUpdate({ codegenGenerateTypes })}
        />
      </SettingRow>

      <SettingRow
        label="Generate schemas"
        description="Generate runtime validation schemas"
      >
        <Toggle
          checked={settings.codegenGenerateSchemas}
          onChange={(codegenGenerateSchemas) => onUpdate({ codegenGenerateSchemas })}
        />
      </SettingRow>

      <SettingRow
        label="Include comments"
        description="Add JSDoc from OpenAPI descriptions"
      >
        <Toggle
          checked={settings.codegenIncludeComments}
          onChange={(codegenIncludeComments) => onUpdate({ codegenIncludeComments })}
        />
      </SettingRow>
    </SettingsSection>
  )
}
