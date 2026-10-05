import { CircleDot, X } from "lucide-react";
import { useState } from "react";

import { Segmented } from "@/design/segmented";
import { ToggleSwitch } from "@/design/toggle-switch";
import { patternProblem } from "@/features/settings/settings-draft";
import { cn } from "@/lib/utils";
import type { SettingsDraft } from "@/settings/use-settings-draft";
import { MAX_REQUESTS } from "../setting-options";
import { SettingRow } from "../setting-row";
import { SettingSection } from "../setting-section";

function IgnorePatterns({ settings }: { settings: SettingsDraft }): React.ReactNode {
  const { draft, set, addIgnore } = settings;
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const add = (): void => {
    const why = addIgnore(typed);
    setProblem(why);
    if (why === null) setTyped("");
  };
  return (
    <>
      {draft.ignorePatterns.length > 0 && (
        <ul aria-label="Ignore patterns" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {draft.ignorePatterns.map((pattern) => (
            <li
              key={pattern}
              title={
                patternProblem([], pattern)
                  ? "Not a regular expression — Studio skips it"
                  : undefined
              }
              className={cn(
                "flex h-6.5 items-center gap-1.5 rounded-[6px] border bg-inset pr-1 pl-2.25 font-mono text-label",
                patternProblem([], pattern) ? "border-err/40 text-err" : "border-line",
              )}
            >
              {pattern}
              <button
                type="button"
                aria-label={`Stop ignoring ${pattern}`}
                onClick={() =>
                  set(
                    "ignorePatterns",
                    draft.ignorePatterns.filter((p) => p !== pattern),
                  )
                }
                className="flex size-4.5 cursor-pointer items-center justify-center rounded-chip text-fg-subtle hover:bg-raised hover:text-fg"
              >
                <X aria-hidden="true" className="size-2.75" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex max-w-105 gap-2">
        <input
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            setProblem(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          aria-label="Ignore pattern to add"
          aria-invalid={problem !== null}
          aria-describedby={problem ? "ignore-problem" : undefined}
          placeholder="^/health, \.png$, analytics"
          className="h-8 min-w-0 flex-1 rounded-card border border-line-strong bg-inset px-2.5 font-mono text-small text-fg outline-none placeholder:text-fg-subtle focus-visible:border-brand"
        />
        <button
          type="button"
          onClick={add}
          className="h-8 cursor-pointer rounded-card border border-line bg-panel-subtle px-3 text-control text-fg hover:border-line-strong focus-visible:outline-2 focus-visible:outline-brand"
        >
          Add
        </button>
      </div>
      {problem && (
        <p id="ignore-problem" role="alert" className="m-0 text-small text-err">
          {problem}
        </p>
      )}
    </>
  );
}

/**
 * Settings → Recording: how many requests Studio keeps, whether they
 * survive a reload, and the paths and endpoints it does not record.
 *
 * @param props - The draft
 * @returns The section
 * @example
 * ```tsx
 * <RecordingSection settings={draft} />
 * ```
 */
export function RecordingSection({ settings }: { settings: SettingsDraft }): React.ReactNode {
  const { draft, changed, set } = settings;
  return (
    <SettingSection
      id="recording"
      label="Recording"
      description="What Studio keeps, and what it leaves out"
      icon={CircleDot}
      tone="text-err"
    >
      <SettingRow
        label="Max requests"
        description="Beyond this many, the oldest requests are dropped"
        edited={changed.has("maxRequests")}
        control={
          <Segmented
            label="Max requests"
            options={MAX_REQUESTS}
            value={String(draft.maxRequests)}
            onChange={(v) => set("maxRequests", Number(v))}
          />
        }
      />
      <SettingRow
        label="Preserve log"
        description="Keep the requests across page reloads"
        edited={changed.has("preserveLog")}
        control={
          <ToggleSwitch
            label="Preserve log"
            size="lg"
            checked={draft.preserveLog}
            onChange={(on) => set("preserveLog", on)}
          />
        }
      />
      <SettingRow
        label="Ignore patterns"
        description="Regular expressions, case-insensitive: a request whose URL — or endpoint name, for a call with no URL — matches one is not recorded"
        edited={changed.has("ignorePatterns")}
      >
        <IgnorePatterns settings={settings} />
      </SettingRow>
    </SettingSection>
  );
}
