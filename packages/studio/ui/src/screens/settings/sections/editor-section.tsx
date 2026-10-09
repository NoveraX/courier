import { SquareCode } from "lucide-react";

import { ChoiceMenu } from "@/design/choice-menu";
import type { SettingsDraft } from "@/settings/use-settings-draft";
import { CODE_EDITORS } from "../setting-options";
import { SettingRow } from "../setting-row";
import { SettingSection } from "../setting-section";

/**
 * Settings → Editor: the editor a call site of an endpoint opens in, from
 * the inspector's and the Explorer's list of where the code calls it.
 *
 * @param props - The draft
 * @returns The section
 * @example
 * ```tsx
 * <EditorSection settings={draft} />
 * ```
 */
export function EditorSection({ settings }: { settings: SettingsDraft }): React.ReactNode {
  const { draft, changed, set } = settings;
  return (
    <SettingSection
      id="editor"
      label="Editor"
      description="Where the code that calls an endpoint opens"
      icon={SquareCode}
      tone="text-syntax-function"
    >
      <SettingRow
        label="Open code in"
        description="A call site opens there from the inspector and the Explorer"
        edited={changed.has("codeEditor")}
        control={
          <ChoiceMenu
            icon={SquareCode}
            label="Editor"
            choices={CODE_EDITORS}
            value={draft.codeEditor}
            onChange={(v) => set("codeEditor", v)}
          />
        }
      />
    </SettingSection>
  );
}
