import { Link } from "@tanstack/react-router";
import { Palette, Rocket } from "lucide-react";

import { Segmented } from "@/design/segmented";
import type { SettingsDraft } from "@/settings/use-settings-draft";
import { THEMES } from "../setting-options";
import { SettingRow } from "../setting-row";
import { SettingSection } from "../setting-section";

/**
 * Settings → Appearance: the theme — shown at once, kept on Save — and the
 * way back to the framework setup.
 *
 * @param props - The draft
 * @returns The section
 * @example
 * ```tsx
 * <AppearanceSection settings={draft} />
 * ```
 */
export function AppearanceSection({ settings }: { settings: SettingsDraft }): React.ReactNode {
  const { draft, changed, set } = settings;
  return (
    <SettingSection
      id="appearance"
      label="Appearance"
      description="The colour scheme of the Studio UI"
      icon={Palette}
      tone="text-syntax-keyword"
    >
      <SettingRow
        label="Theme"
        description="Dark, light, or as the system is set"
        edited={changed.has("theme")}
        control={
          <Segmented
            label="Theme"
            options={THEMES}
            value={draft.theme}
            onChange={(theme) => set("theme", theme)}
          />
        }
      />
      <SettingRow
        label="Setup wizard"
        description="Run the framework setup again if you switched your stack"
        control={
          <Link
            to="/"
            search={{ setup: true }}
            className="flex h-7.5 items-center gap-1.75 rounded-card border border-line bg-panel px-3 text-control font-strong text-fg hover:border-line-strong focus-visible:outline-2 focus-visible:outline-brand pointer-coarse:h-9"
          >
            <Rocket aria-hidden="true" className="size-3.25" />
            Open
          </Link>
        }
      />
    </SettingSection>
  );
}
