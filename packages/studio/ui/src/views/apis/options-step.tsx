import { Input } from "@/components/ui/input";

import type { GenerateOptions } from "./types";
import { ChoiceRow, FieldRow, type OptionChoice, SwitchRow } from "./option-fields";
import { TargetDirHint } from "./target-dir-hint";

const VALIDATION: ReadonlyArray<OptionChoice<GenerateOptions["validation"]>> = [
  { value: "zod", label: "Zod" },
  { value: "valibot", label: "Valibot" },
  { value: "arktype", label: "ArkType" },
  { value: "none", label: "None" },
];
const GROUP_BY: ReadonlyArray<OptionChoice<GenerateOptions["groupBy"]>> = [
  { value: "tag", label: "Tag" },
  { value: "path", label: "Path" },
  { value: "single", label: "Single file" },
];
const CLIENT: ReadonlyArray<OptionChoice<GenerateOptions["generateClient"]>> = [
  { value: "direct", label: "Direct" },
  { value: "proxy", label: "Proxy" },
  { value: "both", label: "Both" },
  { value: "none", label: "None" },
];

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

        <TargetDirHint outputDir={options.outputDir} sourceName={options.sourceName} />

        <ChoiceRow label="Validation library" value={options.validation} choices={VALIDATION} onChange={(validation) => onChange({ validation })} />
        <ChoiceRow label="Group by" value={options.groupBy} choices={GROUP_BY} onChange={(groupBy) => onChange({ groupBy })} />
        <ChoiceRow
          label="Generate client"
          value={options.generateClient}
          choices={CLIENT}
          onChange={(generateClient) => onChange({ generateClient })}
        />

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
