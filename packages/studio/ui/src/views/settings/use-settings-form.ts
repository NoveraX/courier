import { useForm } from "react-hook-form";

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

export function useSettingsForm(): SettingsFormReturn {
  const settings = useStudioStore((s) => s.settings);
  const updateSettings = useStudioStore((s) => s.updateSettings);
  const resetSettings = useStudioStore((s) => s.resetSettings);

  const form = useForm<Settings>({
    resolver: settingsResolver,
    defaultValues: settings,
  });

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

  return { form, isDirty: form.formState.isDirty, onSave, onDiscard, onResetDefaults };
}
