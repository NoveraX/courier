import type { LucideIcon } from "lucide-react";
import { RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { useClearRequests } from "@/hooks/use-clear-requests";
import type { useSessionHistory } from "@/settings/use-session-history";
import { useStudioStore } from "@/store";
import { SettingRow } from "../setting-row";
import { SettingSection } from "../setting-section";

type Action = "requests" | "settings" | "sessions";

interface DangerSectionProps {
  history: ReturnType<typeof useSessionHistory>;
  onResetSettings: () => void;
}

interface Danger {
  action: Action;
  label: string;
  description: string;
  button: string;
  icon: LucideIcon;
  question: string;
  confirm: string;
  run: () => void;
}

function Confirm({ danger, onCancel }: { danger: Danger; onCancel: () => void }): React.ReactNode {
  return (
    <div
      role="alertdialog"
      aria-label={danger.question}
      className="flex flex-wrap items-center gap-2.5 rounded-[9px] border border-err/35 bg-err-dim px-3 py-2.5 text-control"
    >
      <TriangleAlert aria-hidden="true" className="size-3.5 text-err" />
      <span className="min-w-50 flex-1">{danger.question}</span>
      <button
        type="button"
        onClick={onCancel}
        className="h-7 cursor-pointer rounded-control border border-line-strong bg-panel px-2.5 text-small text-fg"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={danger.run}
        className="h-7 cursor-pointer rounded-control bg-err px-3 text-small font-semibold text-bg"
      >
        {danger.confirm}
      </button>
    </div>
  );
}

/**
 * Settings → Danger zone: clearing the captured requests, resetting every
 * setting, deleting the saved sessions — each asking first, in place.
 *
 * @param props - The session history, and what resets the settings
 * @returns The section
 * @example
 * ```tsx
 * <DangerSection history={history} onResetSettings={draft.resetAll} />
 * ```
 */
export function DangerSection({ history, onResetSettings }: DangerSectionProps): React.ReactNode {
  const clearRequests = useClearRequests();
  const requests = useStudioStore((s) => s.requests.length);
  const [asking, setAsking] = useState<Action | null>(null);
  const done = (run: () => void) => () => {
    run();
    setAsking(null);
  };
  const dangers: readonly Danger[] = [
    {
      action: "requests",
      label: "Clear captured requests",
      description: "Removes every request from this page and from what Studio replays",
      button: "Clear",
      icon: Trash2,
      question: `Delete ${requests} captured request${requests === 1 ? "" : "s"}?`,
      confirm: "Delete requests",
      run: done(clearRequests),
    },
    {
      action: "settings",
      label: "Reset all settings",
      description: "Puts every option on this page back to its default",
      button: "Reset",
      icon: RotateCcw,
      question: "Reset every setting to its default?",
      confirm: "Reset settings",
      run: done(onResetSettings),
    },
    {
      action: "sessions",
      label: "Delete saved sessions",
      description: "Removes every saved session from .courier/studio.db",
      button: "Delete",
      icon: Trash2,
      question: `Delete ${history.sessions.length} saved session${history.sessions.length === 1 ? "" : "s"} from disk?`,
      confirm: "Delete sessions",
      run: done(() => void history.deleteAllSessions()),
    },
  ];
  return (
    <SettingSection
      id="danger"
      label="Danger zone"
      description="These cannot be undone"
      icon={TriangleAlert}
      tone="text-err"
      danger
    >
      {dangers.map((danger) => {
        const Icon = danger.icon;
        return (
          <SettingRow
            key={danger.action}
            label={danger.label}
            description={danger.description}
            control={
              <button
                type="button"
                onClick={() => setAsking(danger.action)}
                className="flex h-7.5 cursor-pointer items-center gap-1.75 rounded-card border border-err/40 bg-panel px-3 text-control font-strong whitespace-nowrap text-err hover:bg-err-dim focus-visible:outline-2 focus-visible:outline-brand"
              >
                <Icon aria-hidden="true" className="size-3.25" />
                {danger.button}
              </button>
            }
          >
            {asking === danger.action && (
              <Confirm danger={danger} onCancel={() => setAsking(null)} />
            )}
          </SettingRow>
        );
      })}
    </SettingSection>
  );
}
