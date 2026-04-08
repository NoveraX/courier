import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { ConfigureStep } from "./step-configure";
import { PreviewStep } from "./step-preview";
import { ReviewStep } from "./step-review";
import { SourceStep } from "./step-source";
import { WizardFooter } from "./wizard-footer";
import { WizardStepDot } from "./wizard-step-dot";
import type { MockWizardStep } from "./types";
import type { UseMockGeneratorReturn } from "./use-mock-generator";

const STEPS: Array<{ key: MockWizardStep; label: string }> = [
  { key: "source", label: "Source" },
  { key: "configure", label: "Configure" },
  { key: "review", label: "Endpoints" },
  { key: "preview", label: "Preview" },
];

interface MockGeneratorWizardProps {
  wizard: UseMockGeneratorReturn;
}

export function MockGeneratorWizard({ wizard }: MockGeneratorWizardProps): React.ReactElement {
  const { state, error } = wizard;
  const currentIdx = STEPS.findIndex((s) => s.key === state.step);

  return (
    <Dialog open={wizard.open} onOpenChange={(open) => { if (!open) wizard.close(); }}>
      <DialogContent className="flex max-h-[85vh] flex-col p-0 sm:max-w-3xl">
        <DialogHeader className="px-6 pt-5">
          <DialogTitle className="text-h2">Generate Mock Server</DialogTitle>
          <div className="flex items-center gap-0 pt-3">
            {STEPS.map((step, i) => (
              <WizardStepDot
                key={step.key}
                label={step.label}
                index={i}
                active={i === currentIdx}
                completed={i < currentIdx}
                onClick={i < currentIdx ? () => wizard.goToStep(step.key) : undefined}
              />
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          {state.step === "source" && <SourceStep wizard={wizard} />}
          {state.step === "configure" && <ConfigureStep wizard={wizard} />}
          {state.step === "review" && <ReviewStep wizard={wizard} />}
          {state.step === "preview" && <PreviewStep wizard={wizard} />}

          {error && <p className="mt-3 text-body-sm text-destructive">{error}</p>}
        </div>

        <WizardFooter wizard={wizard} currentIdx={currentIdx} />
      </DialogContent>
    </Dialog>
  );
}
