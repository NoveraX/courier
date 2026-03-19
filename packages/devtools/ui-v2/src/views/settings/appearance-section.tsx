import { Controller } from "react-hook-form";
import { Moon, Sun, Monitor } from "lucide-react";

import type { UseFormReturn } from "react-hook-form";
import type { Settings, Theme, DensityMode } from "@/store/types";

import {
  SegmentedControl,
  type SegmentOption,
} from "@/components/shared/segmented-control";
import { SettingRow } from "./setting-row";

// ── Theme options ────────────────────────────────────────────────────────────

const THEME_OPTIONS: SegmentOption<Theme>[] = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
];

const DENSITY_OPTIONS: SegmentOption<DensityMode>[] = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

// ── Appearance section ───────────────────────────────────────────────────────

interface AppearanceSectionProps {
  form: UseFormReturn<Settings>;
}

export function AppearanceSection({
  form,
}: AppearanceSectionProps): React.ReactElement {
  return (
    <>
      <SettingRow label="Theme" description="Color scheme for the DevTools UI">
        <Controller
          control={form.control}
          name="theme"
          render={({ field }) => (
            <SegmentedControl
              options={THEME_OPTIONS}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </SettingRow>

      <SettingRow
        label="Density"
        description="Controls row height, gaps and padding across all views"
      >
        <Controller
          control={form.control}
          name="density"
          render={({ field }) => (
            <SegmentedControl
              options={DENSITY_OPTIONS}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </SettingRow>
    </>
  );
}
