import { Eye } from "lucide-react";

import { Segmented } from "@/design/segmented";
import type { SettingsDraft } from "@/settings/use-settings-draft";
import { INDENTS, TIMESTAMPS } from "../setting-options";
import { SettingRow } from "../setting-row";
import { SettingSection } from "../setting-section";

/**
 * Settings → Display: how request times read, and the indentation of
 * JSON in bodies, snippets and exports.
 *
 * @param props - The draft
 * @returns The section
 * @example
 * ```tsx
 * <DisplaySection settings={draft} />
 * ```
 */
export function DisplaySection({ settings }: { settings: SettingsDraft }): React.ReactNode {
  const { draft, changed, set } = settings;
  return (
    <SettingSection
      id="display"
      label="Display"
      description="Times and JSON as Studio writes them"
      icon={Eye}
      tone="text-syntax-type"
    >
      <SettingRow
        label="Timestamp format"
        description="How request times read in lists"
        edited={changed.has("timestampFormat")}
        control={
          <Segmented
            label="Timestamp format"
            options={TIMESTAMPS}
            value={draft.timestampFormat}
            onChange={(v) => set("timestampFormat", v)}
          />
        }
      />
      <SettingRow
        label="JSON indentation"
        description="In bodies, diffs, snippets and exports"
        edited={changed.has("jsonIndent")}
        control={
          <Segmented
            label="JSON indentation"
            options={INDENTS}
            value={draft.jsonIndent === 4 ? "4" : "2"}
            onChange={(v) => set("jsonIndent", v === "4" ? 4 : 2)}
          />
        }
      />
    </SettingSection>
  );
}
