import { useNavigate } from "@tanstack/react-router";
import { Monitor, Moon, Sun } from "lucide-react";

import type { UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";
import { restartTour } from "@/components/onboarding/tour-provider";
import { SegmentedControl, type SegmentOption } from "@/components/shared/segmented-control";
import { Button } from "@/components/ui/button";
import { WELCOME_STORAGE_KEY } from "@/features/welcome/frameworks";
import { browserStorage } from "@/lib/browser-storage";
import type { DensityMode, Settings, Theme } from "@/store/types";
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

export function AppearanceSection({ form }: AppearanceSectionProps): React.ReactElement {
  const navigate = useNavigate();
  return (
    <>
      <SettingRow label="Theme" description="Color scheme for the Studio UI">
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

      <SettingRow label="Onboarding tour" description="Walk through all features step by step">
        <Button variant="outline" size="sm" onClick={restartTour}>
          Restart tour
        </Button>
      </SettingRow>

      <SettingRow
        label="Setup wizard"
        description="Re-run the framework setup if you switched your stack"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            browserStorage.remove(WELCOME_STORAGE_KEY);
            navigate({ to: "/", search: { setup: true } });
          }}
        >
          Restart setup
        </Button>
      </SettingRow>
    </>
  );
}
