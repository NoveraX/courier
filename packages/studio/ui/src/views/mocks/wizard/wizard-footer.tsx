/**
 * Footer with Back / Continue buttons for the mock generator wizard.
 *
 * Extracted from `mock-generator-wizard.tsx` so each step's button changes
 * are colocated and the parent file holds only the dialog shell. Knows how
 * to compute the previous step for the Back button and which CTA to render
 * for each step.
 */

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { MockWizardStep } from "./types";
import type { UseMockGeneratorReturn } from "./use-mock-generator";

interface WizardFooterProps {
  wizard: UseMockGeneratorReturn;
  currentIdx: number;
}

export function WizardFooter({ wizard, currentIdx }: WizardFooterProps): React.ReactElement {
  const { state, loading } = wizard;
  const canProceed = state.selectedSources.length > 0 && !state.standalone;

  const prevStep = (): MockWizardStep => {
    if (state.step === "configure") return "source";
    if (state.step === "review") return "configure";
    return "review";
  };

  return (
    <div className="flex items-center justify-between border-t bg-muted rounded-b-lg px-6 py-4">
      <div>
        {currentIdx > 0 && (
          <Button variant="outline" size="sm" onClick={() => wizard.goToStep(prevStep())}>
            Back
          </Button>
        )}
      </div>
      <div>
        {state.step === "source" && (
          <Button size="sm" disabled={!canProceed} onClick={() => wizard.goToStep("configure")}>
            Continue
          </Button>
        )}
        {state.step === "configure" && (
          <Button size="sm" disabled={loading} onClick={() => wizard.generatePreview()}>
            {loading && <Loader2 className="mr-1.5 size-3 animate-spin" />}
            Generate Preview
          </Button>
        )}
        {state.step === "review" && (
          <Button size="sm" onClick={() => wizard.goToStep("preview")}>
            Preview Files
          </Button>
        )}
        {state.step === "preview" && (
          <Button size="sm" disabled={state.writing} onClick={() => void wizard.writeFiles()}>
            {state.writing && <Loader2 className="mr-1.5 size-3 animate-spin" />}
            Write to Disk
          </Button>
        )}
      </div>
    </div>
  );
}
