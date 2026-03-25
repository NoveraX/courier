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

import type { GenerateOptions } from "./types";

interface OptionsStepProps {
  options: GenerateOptions;
  error: string | null;
  onChange: (patch: Partial<GenerateOptions>) => void;
}

export function OptionsStepView({
  options,
  error,
  onChange,
}: OptionsStepProps): React.ReactElement {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h3 className="text-h3 text-foreground">Configure Generation</h3>
        <p className="text-body-sm text-muted-foreground">
          Customize how the API code will be generated.
        </p>
      </div>

      <div className="space-y-4">
        <FieldRow label="Source name">
          <Input
            value={options.sourceName}
            onChange={(e) => onChange({ sourceName: e.target.value })}
            className="h-8 text-xs font-mono max-w-[200px]"
          />
        </FieldRow>

        <FieldRow label="Output directory">
          <Input
            value={options.outputDir}
            onChange={(e) => onChange({ outputDir: e.target.value })}
            className="h-8 text-xs font-mono max-w-[260px]"
          />
        </FieldRow>

        <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2">
          <span className="text-[10px] text-muted-foreground">Files will be written to</span>
          <code className="text-[10px] font-mono text-foreground">
            {options.outputDir.replace(/\/+$/, "")}/{options.sourceName}
          </code>
        </div>

        <FieldRow label="Validation library">
          <Select
            value={options.validation}
            onValueChange={(v) => onChange({ validation: v as GenerateOptions["validation"] })}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zod">Zod</SelectItem>
              <SelectItem value="valibot">Valibot</SelectItem>
              <SelectItem value="arktype">ArkType</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>

        <FieldRow label="Group by">
          <Select
            value={options.groupBy}
            onValueChange={(v) => onChange({ groupBy: v as GenerateOptions["groupBy"] })}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tag">Tag</SelectItem>
              <SelectItem value="path">Path</SelectItem>
              <SelectItem value="single">Single file</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>

        <FieldRow label="Generate client">
          <Select
            value={options.generateClient}
            onValueChange={(v) => onChange({ generateClient: v as GenerateOptions["generateClient"] })}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="direct">Direct</SelectItem>
              <SelectItem value="proxy">Proxy</SelectItem>
              <SelectItem value="both">Both</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <SwitchRow
            label="Generate types"
            checked={options.generateTypes}
            onChange={(v) => onChange({ generateTypes: v })}
          />
          <SwitchRow
            label="Generate schemas"
            checked={options.generateSchemas}
            onChange={(v) => onChange({ generateSchemas: v })}
          />
          <SwitchRow
            label="Auth middleware"
            checked={options.addAuthMiddleware}
            onChange={(v) => onChange({ addAuthMiddleware: v })}
          />
          <SwitchRow
            label="Include comments"
            checked={options.includeComments}
            onChange={(v) => onChange({ includeComments: v })}
          />
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function FieldRow({ label, children }: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label className="text-xs text-muted-foreground shrink-0">{label}</Label>
      {children}
    </div>
  );
}

function SwitchRow({ label, checked, onChange }: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} className="scale-75" />
    </div>
  );
}
