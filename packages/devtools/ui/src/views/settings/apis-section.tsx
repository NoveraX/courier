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
import {
  VALIDATION_LIB_OPTIONS,
  GROUP_BY_OPTIONS,
  CLIENT_OPTIONS,
} from "./constants";
import { SettingRow } from "./setting-row";

// ── APIs defaults section ────────────────────────────────────────────────────

interface ApisSectionProps {
  form: UseFormReturn<Settings>;
}

export function ApisSection({
  form,
}: ApisSectionProps): React.ReactElement {
  return (
    <>
      <SettingRow label="Validation library">
        <Controller
          control={form.control}
          name="apisValidation"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-28" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VALIDATION_LIB_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </SettingRow>

      <SettingRow label="Group by">
        <Controller
          control={form.control}
          name="apisGroupBy"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-32" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUP_BY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </SettingRow>

      <SettingRow label="HTTP client">
        <Controller
          control={form.control}
          name="apisClient"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-36" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLIENT_OPTIONS.map((opt) => (
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
        label="Generate types"
        description="Include TypeScript type definitions in generated code"
        htmlFor="apisGenerateTypes"
      >
        <Controller
          control={form.control}
          name="apisGenerateTypes"
          render={({ field }) => (
            <Switch
              id="apisGenerateTypes"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </SettingRow>

      <SettingRow
        label="Generate schemas"
        description="Include validation schemas in generated code"
        htmlFor="apisGenerateSchemas"
      >
        <Controller
          control={form.control}
          name="apisGenerateSchemas"
          render={({ field }) => (
            <Switch
              id="apisGenerateSchemas"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </SettingRow>

      <SettingRow
        label="Include comments"
        description="Add JSDoc comments to generated code"
        htmlFor="apisIncludeComments"
      >
        <Controller
          control={form.control}
          name="apisIncludeComments"
          render={({ field }) => (
            <Switch
              id="apisIncludeComments"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </SettingRow>
    </>
  );
}
