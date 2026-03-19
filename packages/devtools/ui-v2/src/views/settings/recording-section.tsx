import { Controller } from "react-hook-form";
import { Plus, X } from "lucide-react";

import type { UseFormReturn } from "react-hook-form";
import type { Settings } from "@/store/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MAX_REQUESTS_OPTIONS } from "./constants";
import { SettingRow } from "./setting-row";

// ── Recording section ────────────────────────────────────────────────────────

interface RecordingSectionProps {
  form: UseFormReturn<Settings>;
}

export function RecordingSection({
  form,
}: RecordingSectionProps): React.ReactElement {
  return (
    <>
      <SettingRow
        label="Max requests"
        description="Maximum number of requests kept in memory"
      >
        <Controller
          control={form.control}
          name="maxRequests"
          render={({ field }) => (
            <Select
              value={String(field.value)}
              onValueChange={(v) => field.onChange(Number(v))}
            >
              <SelectTrigger className="w-28" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MAX_REQUESTS_OPTIONS.map((opt) => (
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
        label="Preserve log"
        description="Keep requests when navigating between pages"
        htmlFor="preserveLog"
      >
        <Controller
          control={form.control}
          name="preserveLog"
          render={({ field }) => (
            <Switch
              id="preserveLog"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </SettingRow>

      <IgnorePatternsField form={form} />
    </>
  );
}

// ── Ignore patterns ──────────────────────────────────────────────────────────

function IgnorePatternsField({
  form,
}: {
  form: UseFormReturn<Settings>;
}): React.ReactElement {
  const patterns = form.watch("ignorePatterns");

  function addPattern(): void {
    form.setValue("ignorePatterns", [...patterns, ""], { shouldDirty: true });
  }

  function removePattern(index: number): void {
    form.setValue(
      "ignorePatterns",
      patterns.filter((_, i) => i !== index),
      { shouldDirty: true },
    );
  }

  function updatePattern(index: number, value: string): void {
    const next = [...patterns];
    next[index] = value;
    form.setValue("ignorePatterns", next, { shouldDirty: true });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-body-sm text-foreground">Ignore URL patterns</Label>
          <p className="text-body-xs text-muted-foreground mt-0.5">
            Regex patterns — matching requests won&apos;t be recorded
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={addPattern}>
          <Plus className="mr-1 size-3" />
          Add
        </Button>
      </div>
      {patterns.map((pattern, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={pattern}
            onChange={(e) => updatePattern(i, e.target.value)}
            placeholder="e.g. /health|/_next/static"
            className="h-8 font-mono text-xs"
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => removePattern(i)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
