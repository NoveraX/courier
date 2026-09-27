/**
 * The API import wizard: import a spec, select endpoints, choose options,
 * preview, write. The declare step follows a write only while courier.config
 * lacks part of the import's declaration; the files are written by then, so
 * no step before it can be revisited. The wizard cannot be closed while a
 * write is under way.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { UseImportReturn } from "./use-import";
import type { ImportStep } from "./types";
import { DeclareStepView } from "./declare-step";
import { ImportStepView } from "./import-step";
import { OptionsStepView } from "./options-step";
import { PreviewStepView } from "./preview-step";
import { SelectStepView } from "./select-step";
import { StepDot } from "./import-wizard-step-dot";
import { WizardFooter } from "./import-wizard-footer";

interface ImportWizardProps {
  wizard: UseImportReturn;
}

const STEPS: Array<{ key: ImportStep; label: string }> = [
  { key: "import", label: "Import" },
  { key: "select", label: "Select" },
  { key: "options", label: "Configure" },
  { key: "preview", label: "Preview" },
];

export function ImportWizard({ wizard }: ImportWizardProps): React.ReactElement {
  const { state, error } = wizard;
  const written = state.step === "declare";
  const currentIdx = written ? STEPS.length : STEPS.findIndex((s) => s.key === state.step);

  return (
    <Dialog open={wizard.open} onOpenChange={(open) => { if (!open && !wizard.state.writing) wizard.close(); }}>
      <DialogContent className="p-0 sm:max-w-3xl">
        <DialogHeader className="px-6 pt-5">
          <DialogTitle className="text-balance">Import API</DialogTitle>
          <div className="flex items-center gap-1 pt-2">
            {STEPS.map((step, i) => (
              <StepDot
                key={step.key}
                label={step.label}
                index={i}
                active={i === currentIdx}
                completed={i < currentIdx}
                onClick={i < currentIdx && !written ? () => wizard.goToStep(step.key) : undefined}
              />
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          {state.step === "import" && (
            <ImportStepView
              source={state.source}
              content={state.content}
              error={error}
              onSourceChange={wizard.setSource}
              onContentChange={wizard.setContent}
            />
          )}

          {state.step === "select" && state.spec && (
            <SelectStepView
              spec={state.spec}
              selected={state.selectedEndpoints}
              onToggleEndpoint={wizard.toggleEndpoint}
              onToggleGroup={wizard.toggleGroup}
              onToggleAll={wizard.toggleAll}
            />
          )}

          {state.step === "options" && (
            <OptionsStepView
              options={state.options}
              error={error}
              onChange={wizard.setOptions}
            />
          )}

          {state.step === "preview" && (
            <PreviewStepView
              files={state.generatedFiles}
              sourceName={state.options.sourceName}
              error={error}
              consent={state.consent}
              onToggleConfirmed={wizard.toggleConfirmed}
            />
          )}

          {state.step === "declare" && state.declaration && (
            <DeclareStepView sourceName={state.options.sourceName} declaration={state.declaration} />
          )}
        </div>

        <WizardFooter wizard={wizard} />
      </DialogContent>
    </Dialog>
  );
}
