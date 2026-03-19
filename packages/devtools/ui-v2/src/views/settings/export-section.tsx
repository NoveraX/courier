import { Controller } from "react-hook-form";

import type { UseFormReturn } from "react-hook-form";
import type { Settings } from "@/store/types";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingRow } from "./setting-row";

// ── Export format options ────────────────────────────────────────────────────

const EXPORT_FORMAT_OPTIONS = [
  { value: "har", label: "HAR (HTTP Archive)" },
  { value: "json", label: "JSON" },
  { value: "postman", label: "Postman Collection" },
] as const;

// ── Export section ───────────────────────────────────────────────────────────

interface ExportSectionProps {
  form: UseFormReturn<Settings>;
}

export function ExportSection({
  form,
}: ExportSectionProps): React.ReactElement {
  return (
    <SettingRow
      label="Default export format"
      description="Used for quick export — other formats available via submenu"
    >
      <Controller
        control={form.control}
        name="defaultExportFormat"
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger className="w-44" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPORT_FORMAT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </SettingRow>
  );
}
