import { useEffect, useState } from "react";
import { toast } from "sonner";

import { changedKeys, patternProblem, rebase } from "@/features/settings/settings-draft";
import { useStudioStore } from "@/store";
import { DEFAULT_SETTINGS } from "@/store/constants";
import { applyTheme } from "@/store/theme";
import type { Settings } from "@/store/types-ui";

/** The settings as edited, what changed, and what saves, discards or resets them. */
export interface SettingsDraft {
  draft: Settings;
  changed: ReadonlySet<keyof Settings>;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  /** Adds an ignore pattern; says why not when it cannot be one. */
  addIgnore: (raw: string) => string | null;
  save: () => void;
  discard: () => void;
  /** Saves Studio's defaults for every setting. */
  resetAll: () => void;
}

/**
 * The Settings page's draft: the saved settings to edit, applied only on
 * Save — a theme picked shows at once and goes back on Discard or when
 * the page closes unsaved — and following any setting saved elsewhere
 * meanwhile that the draft did not change.
 *
 * @returns The draft and its actions
 * @example
 * ```ts
 * const { draft, set, save } = useSettingsDraft();
 * set("jsonIndent", 4);
 * ```
 */
export function useSettingsDraft(): SettingsDraft {
  const saved = useStudioStore((s) => s.settings);
  const updateSettings = useStudioStore((s) => s.updateSettings);
  const resetSettings = useStudioStore((s) => s.resetSettings);
  const [base, setBase] = useState(saved);
  const [draft, setDraft] = useState(saved);
  if (base !== saved) {
    setDraft(rebase(draft, base, saved));
    setBase(saved);
  }
  /* The theme picked shows at once; the saved one comes back when the draft leaves it. */
  useEffect(() => {
    applyTheme(draft.theme);
    return () => applyTheme(useStudioStore.getState().settings.theme);
  }, [draft.theme]);
  return {
    draft,
    changed: changedKeys(draft, saved),
    set: (key, value) => setDraft((current) => ({ ...current, [key]: value })),
    addIgnore: (raw) => {
      const problem = patternProblem(draft.ignorePatterns, raw);
      if (problem === null) {
        setDraft((current) => ({
          ...current,
          ignorePatterns: [...current.ignorePatterns, raw.trim()],
        }));
      }
      return problem;
    },
    save: () => {
      updateSettings(draft);
      toast.success("Settings saved");
    },
    discard: () => setDraft(saved),
    resetAll: () => {
      resetSettings();
      setDraft(DEFAULT_SETTINGS);
      toast.success("Settings reset to their defaults");
    },
  };
}
