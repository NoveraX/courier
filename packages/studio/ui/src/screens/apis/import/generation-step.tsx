import { FolderOutput } from "lucide-react";

import { useImportLayout } from "@/apis/use-import-layout";
import { FIELD_INPUT, FormField } from "@/design/form-field";
import { Segmented } from "@/design/segmented";
import { ToggleSwitch } from "@/design/toggle-switch";
import type { GenerateOptions } from "@/features/apis/types";
import { CLIENT, FLAGS, flagPatch, GROUP_BY, VALIDATION } from "./generation-options";

interface GenerationStepProps {
  options: GenerateOptions;
  error: string | null;
  /** Whether the spec tags none of its operations, so grouping by tag puts none in a group. */
  untagged?: boolean;
  onChange: (patch: Partial<GenerateOptions>) => void;
}

/**
 * The Configure step: what the generated source is called and where it is
 * written — the directory Studio will really use — its validation library,
 * how its files are split, the client it gets, and what it includes.
 *
 * @param props - The options, Studio's error, and what changing them does
 * @returns The step
 * @example
 * ```tsx
 * <GenerationStep options={options} error={null} onChange={setOptions} />
 * ```
 */
export function GenerationStep({
  options,
  error,
  untagged = false,
  onChange,
}: GenerationStepProps): React.ReactNode {
  const layout = useImportLayout(options.outputDir, options.sourceName);
  return (
    <div className="flex flex-col gap-1">
      <h3 className="m-0 pb-2.5 text-title font-semibold">Configure generation</h3>
      <FormField id="import-name" label="Source name" sub="its name under sources">
        <input
          id="import-name"
          value={options.sourceName}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(e) => onChange({ sourceName: e.target.value })}
          className={`${FIELD_INPUT} max-w-80`}
        />
      </FormField>
      <FormField
        id="import-dir"
        label="Output directory"
        sub="relative to the project root"
        error={layout.error}
      >
        <input
          id="import-dir"
          value={options.outputDir}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(e) => onChange({ outputDir: e.target.value })}
          className={`${FIELD_INPUT} max-w-80`}
        />
      </FormField>
      <FormField id="import-validation" label="Validation" sub="runtime schema library">
        <Segmented
          label="Validation"
          quiet="subtle"
          options={VALIDATION}
          value={options.validation}
          onChange={(validation) => onChange({ validation })}
        />
      </FormField>
      <FormField
        id="import-group"
        label="Group by"
        sub={
          untagged && options.groupBy === "tag"
            ? "no endpoint has a tag: by tag, none goes in a group"
            : "how endpoints split into files"
        }
      >
        <Segmented
          label="Group by"
          quiet="subtle"
          options={GROUP_BY}
          value={options.groupBy}
          onChange={(groupBy) => onChange({ groupBy })}
        />
      </FormField>
      <FormField id="import-client" label="Client" sub="how the app calls it">
        <Segmented
          label="Client"
          quiet="subtle"
          options={CLIENT}
          value={options.generateClient}
          onChange={(generateClient) => onChange({ generateClient })}
        />
      </FormField>
      {FLAGS.map((flag) => (
        <div
          key={flag.key}
          className="grid min-h-13 grid-cols-[minmax(0,1fr)_34px] items-center gap-4 border-b border-line"
        >
          <label htmlFor={`import-${flag.key}`} className="flex cursor-pointer flex-col gap-0.5">
            <span className="text-control font-strong">{flag.label}</span>
            <span className="text-badge text-fg-subtle">{flag.sub}</span>
          </label>
          <ToggleSwitch
            id={`import-${flag.key}`}
            label={flag.label}
            checked={options[flag.key]}
            onChange={(on) => onChange(flagPatch(flag.key, on))}
          />
        </div>
      ))}
      <p className="m-0 mt-3 flex items-center gap-2 rounded-[9px] bg-inset px-3 py-2.5 text-small text-fg-subtle">
        <FolderOutput aria-hidden="true" className="size-3.25" />
        Files will be written to <span className="font-mono text-fg">{layout.dir ?? "…"}</span>
      </p>
      {error && (
        <p
          role="alert"
          className="m-0 mt-2 rounded-panel bg-err-dim px-3 py-2.5 text-control text-err"
        >
          {error}
        </p>
      )}
    </div>
  );
}
