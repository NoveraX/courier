import { type UseConfigDeclare, useConfigDeclare } from "@/apis/use-config-declare";
import type { UseImportReturn } from "@/apis/use-import";
import { DialogFrame } from "@/design/dialog-frame";
import { StepBar } from "@/design/step-bar";
import { DeclareStep } from "./declare-step";
import { FilesStep } from "./files-step";
import { GenerationStep } from "./generation-step";
import { ImportFooter } from "./import-footer";
import { SelectEndpointsStep } from "./select-endpoints-step";
import { SpecSourceStep } from "./spec-source-step";

const STEPS = [
  { key: "import", label: "Import" },
  { key: "select", label: "Select" },
  { key: "options", label: "Configure" },
  { key: "preview", label: "Preview" },
] as const;

function StepBody({
  wizard,
  declare,
}: {
  wizard: UseImportReturn;
  declare: UseConfigDeclare;
}): React.ReactNode {
  const { state, error } = wizard;
  if (state.step === "import")
    return (
      <SpecSourceStep
        source={state.source}
        content={state.content}
        error={error}
        onSourceChange={wizard.setSource}
        onContentChange={wizard.setContent}
      />
    );
  if (state.step === "select" && state.spec)
    return (
      <SelectEndpointsStep
        spec={state.spec}
        selected={state.selectedEndpoints}
        onToggleEndpoint={wizard.toggleEndpoint}
        onToggleGroup={wizard.toggleGroup}
        onToggleAll={wizard.toggleAll}
      />
    );
  if (state.step === "options")
    return <GenerationStep options={state.options} error={error} onChange={wizard.setOptions} />;
  if (state.step === "preview")
    return (
      <FilesStep
        files={state.generatedFiles}
        sourceName={state.options.sourceName}
        error={error}
        consent={state.consent}
        onToggleConfirmed={wizard.toggleConfirmed}
      />
    );
  if (state.step === "declare" && state.declaration)
    return (
      <DeclareStep
        sourceName={state.options.sourceName}
        declaration={state.declaration}
        declare={declare}
      />
    );
  return null;
}

/**
 * Import API: read an OpenAPI, Swagger or Postman spec, pick its
 * endpoints, configure the code generated for it, preview the files and
 * write them — then what to declare in the config. It cannot be closed
 * while files are being written, and once a spec is read a click outside
 * or Esc leaves it open: the picks would go with it.
 *
 * @param props - The import from `useImport`
 * @returns The dialog
 * @example
 * ```tsx
 * const wizard = useImport(onWritten);
 * <ImportDialog wizard={wizard} />
 * ```
 */
export function ImportDialog({ wizard }: { wizard: UseImportReturn }): React.ReactNode {
  const { state } = wizard;
  const declare = useConfigDeclare(state);
  const done = state.step === "declare";
  const current = done ? STEPS.length : STEPS.findIndex((step) => step.key === state.step);
  return (
    <DialogFrame
      open={wizard.open}
      onClose={() => !state.writing && wizard.close()}
      keepOpen={state.writing || (state.spec !== null && !done)}
      closable={!state.writing}
      title="Import API"
      width="w-190"
      header={
        <StepBar
          steps={STEPS}
          current={current}
          canGoBack={() => !done && !state.writing}
          onBack={wizard.goToStep}
        />
      }
      footer={<ImportFooter wizard={wizard} declare={declare} />}
    >
      <StepBody wizard={wizard} declare={declare} />
    </DialogFrame>
  );
}
