import { Bell } from "lucide-react";

import { Segmented } from "@/design/segmented";
import { ToggleSwitch } from "@/design/toggle-switch";
import type { SettingsDraft } from "@/settings/use-settings-draft";
import type { Settings } from "@/store/types-ui";
import { SLOW_THRESHOLDS } from "../setting-options";
import { SettingRow } from "../setting-row";
import { SettingSection } from "../setting-section";

type Flag = "toastOnError" | "toastOnSlowRequest" | "toastOnFileChange";

function FlagRow({
  settings,
  flag,
  label,
  description,
}: {
  settings: SettingsDraft;
  flag: Flag;
  label: string;
  description: string;
}): React.ReactNode {
  const value: Settings[Flag] = settings.draft[flag];
  return (
    <SettingRow
      label={label}
      description={description}
      edited={settings.changed.has(flag)}
      control={
        <ToggleSwitch
          label={label}
          size="lg"
          checked={value}
          onChange={(on) => settings.set(flag, on)}
        />
      }
    />
  );
}

/**
 * Settings → Notifications: the toasts for failed and slow requests and
 * for changed files, and the slow-request threshold every screen's
 * colours and the Timeline's Slow view go by.
 *
 * @param props - The draft
 * @returns The section
 * @example
 * ```tsx
 * <NotificationsSection settings={draft} />
 * ```
 */
export function NotificationsSection({ settings }: { settings: SettingsDraft }): React.ReactNode {
  const { draft, changed, set } = settings;
  return (
    <SettingSection
      id="notifications"
      label="Notifications"
      description="Toasts for failures, slow requests and file changes"
      icon={Bell}
      tone="text-warn"
    >
      <FlagRow
        settings={settings}
        flag="toastOnError"
        label="Toast on error"
        description="Say so when a request fails"
      />
      <FlagRow
        settings={settings}
        flag="toastOnSlowRequest"
        label="Toast on slow request"
        description="Say so when a request takes longer than the threshold"
      />
      <SettingRow
        label="Slow request threshold"
        description="Also what colours latency across Studio, and what the Timeline's Slow view shows"
        edited={changed.has("slowRequestThreshold")}
        control={
          <Segmented
            label="Slow request threshold"
            options={SLOW_THRESHOLDS}
            value={String(draft.slowRequestThreshold)}
            onChange={(v) => set("slowRequestThreshold", Number(v))}
          />
        }
      />
      <FlagRow
        settings={settings}
        flag="toastOnFileChange"
        label="Toast on file change"
        description="Say so when the config or an API file changes on disk"
      />
    </SettingSection>
  );
}
