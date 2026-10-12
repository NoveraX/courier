import { useSessionHistory } from "@/settings/use-session-history";
import { useSettingsDraft } from "@/settings/use-settings-draft";
import { useStorage } from "@/settings/use-storage";
import { SaveBar } from "./save-bar";
import { ApiDefaultsSection } from "./sections/api-defaults-section";
import { AppearanceSection } from "./sections/appearance-section";
import { ConnectionSection } from "./sections/connection-section";
import { DangerSection } from "./sections/danger-section";
import { DisplaySection } from "./sections/display-section";
import { EditorSection } from "./sections/editor-section";
import { ExportSection } from "./sections/export-section";
import { NotificationsSection } from "./sections/notifications-section";
import { RecordingSection } from "./sections/recording-section";
import { SessionsSection } from "./sections/sessions-section";
import { StorageSection } from "./sections/storage-section";
import { SettingsNav } from "./settings-nav";

/**
 * The Settings page: Studio's settings by section, edited as a draft —
 * each changed row marked, its section marked in the navigation — and kept
 * on Save; the sessions Studio keeps; and the destructive actions, each
 * asking first. From 860px the navigation is a column beside the sections;
 * narrower, it heads them, and its row of sections stays in view.
 *
 * @returns The page
 * @example
 * ```tsx
 * <SettingsScreen />
 * ```
 */
export function SettingsScreen(): React.ReactNode {
  const settings = useSettingsDraft();
  const history = useSessionHistory();
  const storage = useStorage();
  return (
    <div className="mx-auto flex w-full max-w-280 flex-col gap-4 px-6 pt-6 pb-10 max-sm:px-4 max-sm:pt-4 min-[860px]:grid min-[860px]:grid-cols-[200px_minmax(0,1fr)] min-[860px]:items-start min-[860px]:gap-7">
      <SettingsNav changed={settings.changed} />
      <div className="flex min-w-0 flex-col gap-4">
        <AppearanceSection settings={settings} />
        <ConnectionSection settings={settings} />
        <EditorSection settings={settings} />
        <RecordingSection settings={settings} />
        <DisplaySection settings={settings} />
        <NotificationsSection settings={settings} />
        <ExportSection settings={settings} />
        <ApiDefaultsSection settings={settings} />
        <SessionsSection history={history} />
        <StorageSection
          settings={settings}
          storage={storage}
          onCleared={(kinds) => {
            if (kinds.includes("sessions")) void history.refresh();
          }}
        />
        <DangerSection history={history} onResetSettings={settings.resetAll} />
        {settings.changed.size > 0 && (
          <SaveBar
            count={settings.changed.size}
            onDiscard={settings.discard}
            onSave={settings.save}
          />
        )}
      </div>
    </div>
  );
}
