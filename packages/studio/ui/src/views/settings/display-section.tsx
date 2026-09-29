import type { UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Switch } from "@/components/ui/switch";
import type { Settings } from "@/store/types";
import { JSON_INDENT_OPTIONS, TIMESTAMP_OPTIONS } from "./constants";
import { SettingRow } from "./setting-row";

// ── Display section ──────────────────────────────────────────────────────────

interface DisplaySectionProps {
  form: UseFormReturn<Settings>;
}

export function DisplaySection({ form }: DisplaySectionProps): React.ReactElement {
  return (
    <>
      <SettingRow label="Timestamp format">
        <Controller
          control={form.control}
          name="timestampFormat"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-40" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMESTAMP_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </SettingRow>

      <SettingRow label="JSON indentation">
        <Controller
          control={form.control}
          name="jsonIndent"
          render={({ field }) => (
            <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
              <SelectTrigger className="w-28" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JSON_INDENT_OPTIONS.map((opt) => (
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
        label="Show request preview"
        description="Display request payload preview in timeline list"
        htmlFor="showRequestPreview"
      >
        <Controller
          control={form.control}
          name="showRequestPreview"
          render={({ field }) => (
            <Switch
              id="showRequestPreview"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </SettingRow>
    </>
  );
}
