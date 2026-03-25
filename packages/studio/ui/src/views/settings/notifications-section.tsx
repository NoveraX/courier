import { Controller } from "react-hook-form";

import type { UseFormReturn } from "react-hook-form";
import type { Settings } from "@/store/types";

import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SLOW_THRESHOLD_OPTIONS } from "./constants";
import { SettingRow } from "./setting-row";

// ── Notifications section ────────────────────────────────────────────────────

interface NotificationsSectionProps {
  form: UseFormReturn<Settings>;
}

export function NotificationsSection({
  form,
}: NotificationsSectionProps): React.ReactElement {
  return (
    <>
      <SettingRow
        label="Toast on error"
        description="Show a notification when a request fails"
        htmlFor="toastOnError"
      >
        <Controller
          control={form.control}
          name="toastOnError"
          render={({ field }) => (
            <Switch
              id="toastOnError"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </SettingRow>

      <SettingRow
        label="Toast on slow request"
        description="Show a notification when a request exceeds the threshold"
        htmlFor="toastOnSlowRequest"
      >
        <Controller
          control={form.control}
          name="toastOnSlowRequest"
          render={({ field }) => (
            <Switch
              id="toastOnSlowRequest"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </SettingRow>

      <SettingRow label="Slow request threshold">
        <Controller
          control={form.control}
          name="slowRequestThreshold"
          render={({ field }) => (
            <Select
              value={String(field.value)}
              onValueChange={(v) => field.onChange(Number(v))}
            >
              <SelectTrigger className="w-28" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SLOW_THRESHOLD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </SettingRow>

      <SettingRow
        label="Toast on file change"
        description="Show a notification when watched files are modified"
        htmlFor="toastOnFileChange"
      >
        <Controller
          control={form.control}
          name="toastOnFileChange"
          render={({ field }) => (
            <Switch
              id="toastOnFileChange"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </SettingRow>
    </>
  );
}
