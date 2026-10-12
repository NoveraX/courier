import { FileInput, History, Save } from "lucide-react";
import { useState } from "react";
import { pickSessionFile } from "@/features/sessions/open-session-file";
import { shareSessionFile } from "@/features/sessions/session-file-dialog-store";
import { saveAsTest } from "@/features/tests/recorded-test-store";
import { useNow } from "@/hooks/use-tick";
import { formatClockTime } from "@/lib/formatters";
import type { useSessionHistory } from "@/settings/use-session-history";
import { useStudioStore } from "@/store";
import { SettingRow } from "../setting-row";
import { SettingSection } from "../setting-section";
import { SavedSessionRow } from "./saved-session-row";

interface SessionsSectionProps {
  history: ReturnType<typeof useSessionHistory>;
}

/**
 * Settings → Session history: the requests on this page saved as a named
 * session, a session file a colleague sent opened, and the sessions Studio
 * keeps — loaded back, exported in the default format, shared as a session
 * file, or deleted.
 *
 * @param props - The session history
 * @returns The section
 * @example
 * ```tsx
 * <SessionsSection history={useSessionHistory()} />
 * ```
 */
export function SessionsSection({ history }: SessionsSectionProps): React.ReactNode {
  const requests = useStudioStore((s) => s.requests.length);
  const format = useStudioStore((s) => s.settings.defaultExportFormat);
  const now = useNow();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async (): Promise<void> => {
    setSaving(true);
    const saved = await history.saveCurrentSession(
      name.trim() || `Session · ${formatClockTime(Date.now()).slice(0, 5)}`,
    );
    setSaving(false);
    if (saved) setName("");
  };
  return (
    <SettingSection
      id="sessions"
      label="Session history"
      description="Sessions saved to reload later"
      icon={History}
      tone="text-ok"
    >
      <SettingRow
        label="Current session"
        description={`${requests} request${requests === 1 ? "" : "s"} on this page`}
        control={
          <span className="flex gap-2 @max-[30rem]:w-full">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Name for the session"
              placeholder="Name it, or leave it to the time"
              autoCorrect="off"
              className="h-7.5 w-55 min-w-0 rounded-card border border-line bg-inset px-2.5 text-control text-fg outline-none placeholder:text-fg-subtle focus-visible:border-brand pointer-coarse:h-9 pointer-coarse:text-figure @max-[30rem]:w-auto @max-[30rem]:flex-1"
            />
            <button
              type="button"
              disabled={requests === 0 || saving}
              onClick={() => void save()}
              className="flex h-7.5 shrink-0 cursor-pointer items-center gap-1.75 rounded-card border border-line bg-panel px-3 text-control font-strong whitespace-nowrap text-fg hover:border-line-strong disabled:cursor-default disabled:opacity-50 pointer-coarse:h-9"
            >
              <Save aria-hidden="true" className="size-3.25" />
              {saving ? "Saving…" : "Save session"}
            </button>
          </span>
        }
      />
      <SettingRow
        label="Session file"
        description="One a colleague shared — opened read-only, with the environment it was recorded in"
        control={
          <button
            type="button"
            onClick={pickSessionFile}
            className="flex h-7.5 cursor-pointer items-center gap-1.75 rounded-card border border-line bg-panel px-3 text-control font-strong whitespace-nowrap text-fg hover:border-line-strong pointer-coarse:h-9"
          >
            <FileInput aria-hidden="true" className="size-3.25" />
            Open a session file
          </button>
        }
      />
      <SettingRow
        label="Saved"
        description={`${history.sessions.length} session${history.sessions.length === 1 ? "" : "s"} · kept in .courier/studio.db`}
      >
        {history.sessions.length > 0 && (
          <ul
            aria-label="Saved sessions"
            className="@container m-0 flex list-none flex-col overflow-hidden rounded-panel border border-line p-0"
          >
            {history.sessions.map((session) => (
              <SavedSessionRow
                key={session.id}
                session={session}
                now={now}
                onLoad={() => void history.loadSession(session.id)}
                onExport={() => void history.exportSession(session.id, format)}
                onShare={() => shareSessionFile({ kind: "saved", id: session.id })}
                onTest={() => saveAsTest({ kind: "saved", id: session.id })}
                onDelete={() => void history.deleteSession(session.id)}
              />
            ))}
          </ul>
        )}
      </SettingRow>
    </SettingSection>
  );
}
