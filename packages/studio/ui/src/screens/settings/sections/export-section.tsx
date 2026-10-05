import { FileOutput } from "lucide-react";

import { Segmented } from "@/design/segmented";
import type { SettingsDraft } from "@/settings/use-settings-draft";
import { EXPORT_FORMATS } from "../setting-options";
import { SettingRow } from "../setting-row";
import { SettingSection } from "../setting-section";

/**
 * Settings → Export: the format Export writes requests in.
 *
 * @param props - The draft
 * @returns The section
 * @example
 * ```tsx
 * <ExportSection settings={draft} />
 * ```
 */
export function ExportSection({ settings }: { settings: SettingsDraft }): React.ReactNode {
  const { draft, changed, set } = settings;
  return (
    <SettingSection
      id="export"
      label="Export"
      description="The format requests and sessions export in"
      icon={FileOutput}
      tone="text-fg-muted"
    >
      <SettingRow
        label="Default format"
        description="What Export writes on the Timeline, Analytics and saved sessions"
        edited={changed.has("defaultExportFormat")}
        control={
          <Segmented
            label="Default format"
            options={EXPORT_FORMATS}
            value={draft.defaultExportFormat}
            onChange={(v) => set("defaultExportFormat", v)}
          />
        }
      />
    </SettingSection>
  );
}
