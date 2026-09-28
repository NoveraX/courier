import { useForm, useFormState } from "react-hook-form";

import type {
  UseFormReturn,
  ResolverResult,
  ResolverOptions,
} from "react-hook-form";
import type { Settings } from "@/store/types";

import { useStudioStore } from "@/store";
import { DEFAULT_SETTINGS } from "@/store/constants";
import { settingsSchema } from "./types";

// ── Zod 4 manual resolver (standard-schema resolver has generics issues) ────

function settingsResolver(
  values: Settings,
  _ctx: unknown,
  _opts: ResolverOptions<Settings>,
): ResolverResult<Settings> {
  const result = settingsSchema.safeParse(values);
  if (result.success) {
    return { values: result.data, errors: {} as Record<string, never> };
  }
  const errors: Record<string, { type: string; message: string }> = {};
  for (const issue of result.error?.issues ?? []) {
    errors[issue.path.join(".")] = { type: "validation", message: issue.message };
  }
  return { values: {} as Record<string, never>, errors };
}

// ── Settings form hook ───────────────────────────────────────────────────────

export interface SettingsFormReturn {
  form: UseFormReturn<Settings>;
  isDirty: boolean;
  onSave: (values: Settings) => void;
  onDiscard: () => void;
  onResetDefaults: () => void;
}

/**
 * The settings form: its values start from the saved settings, and a save
 * writes them back to the store, which persists and applies them.
 *
 * `isDirty` is read through `useFormState`, which hands out a new state on
 * every change. Reading it off `form.formState` does not: `form` is the same
 * object for the life of the form, so a memoizing compiler reads the proxy
 * once and the form never reads as changed.
 *
 * @returns The form, whether it differs from the saved settings, and its actions
 *
 * @example
 * ```tsx
 * const { form, isDirty, onSave } = useSettingsForm();
 * return isDirty ? <UnsavedBanner onSave={form.handleSubmit(onSave)} onDiscard={onDiscard} /> : null;
 * ```
 */
export function useSettingsForm(): SettingsFormReturn {
  const settings = useStudioStore((s) => s.settings);
  const updateSettings = useStudioStore((s) => s.updateSettings);
  const resetSettings = useStudioStore((s) => s.resetSettings);

  const form = useForm<Settings>({
    resolver: settingsResolver,
    defaultValues: settings,
  });
  const { isDirty } = useFormState({ control: form.control });

  function onSave(values: Settings): void {
    updateSettings(values);
    form.reset(values);
  }

  function onDiscard(): void {
    form.reset(settings);
  }

  function onResetDefaults(): void {
    resetSettings();
    form.reset(DEFAULT_SETTINGS);
  }

  return { form, isDirty, onSave, onDiscard, onResetDefaults };
}
