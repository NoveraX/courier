import { CodeXml } from "lucide-react";

import { Segmented } from "@/design/segmented";
import { ToggleSwitch } from "@/design/toggle-switch";
import type { SettingsDraft } from "@/settings/use-settings-draft";
import type { Settings } from "@/store/types-ui";
import { CLIENTS, GROUP_BYS, VALIDATIONS } from "../setting-options";
import { SettingRow } from "../setting-row";
import { SettingSection } from "../setting-section";

type Flag = "apisGenerateTypes" | "apisGenerateSchemas" | "apisIncludeComments";

const FLAGS: readonly { flag: Flag; label: string; description: string }[] = [
  {
    flag: "apisGenerateTypes",
    label: "Generate types",
    description: "Write TypeScript types for variables and responses",
  },
  {
    flag: "apisGenerateSchemas",
    label: "Generate schemas",
    description: "Write validation schemas beside the types",
  },
  {
    flag: "apisIncludeComments",
    label: "Include comments",
    description: "Carry the spec's descriptions over as JSDoc",
  },
];

/**
 * Settings → API defaults: what Import API starts from — the validation
 * library, how operations become groups, which clients are written, and
 * whether types, schemas and comments are.
 *
 * @param props - The draft
 * @returns The section
 * @example
 * ```tsx
 * <ApiDefaultsSection settings={draft} />
 * ```
 */
export function ApiDefaultsSection({ settings }: { settings: SettingsDraft }): React.ReactNode {
  const { draft, changed, set } = settings;
  return (
    <SettingSection
      id="apis"
      label="API defaults"
      description="Where Import API starts from"
      icon={CodeXml}
      tone="text-brand"
    >
      <SettingRow
        label="Validation library"
        description="The runtime schemas generated endpoints check with"
        edited={changed.has("apisValidation")}
        control={
          <Segmented
            label="Validation library"
            options={VALIDATIONS}
            value={draft.apisValidation}
            onChange={(v) => set("apisValidation", v)}
          />
        }
      />
      <SettingRow
        label="Group by"
        description="How the spec's operations become Courier groups"
        edited={changed.has("apisGroupBy")}
        control={
          <Segmented
            label="Group by"
            options={GROUP_BYS}
            value={draft.apisGroupBy}
            onChange={(v) => set("apisGroupBy", v)}
          />
        }
      />
      <SettingRow
        label="HTTP client"
        description="Which callers to write for the API"
        edited={changed.has("apisClient")}
        control={
          <Segmented
            label="HTTP client"
            options={CLIENTS}
            value={draft.apisClient}
            onChange={(v) => set("apisClient", v)}
          />
        }
      />
      {FLAGS.map(({ flag, label, description }) => {
        const value: Settings[Flag] = draft[flag];
        return (
          <SettingRow
            key={flag}
            label={label}
            description={description}
            edited={changed.has(flag)}
            control={
              <ToggleSwitch
                label={label}
                size="lg"
                checked={value}
                onChange={(on) => set(flag, on)}
              />
            }
          />
        );
      })}
    </SettingSection>
  );
}
