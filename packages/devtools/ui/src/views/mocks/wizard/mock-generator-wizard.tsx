import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { SourceStep } from "./step-source";
import { ConfigureStep } from "./step-configure";
import { ReviewStep } from "./step-review";
import { PreviewStep } from "./step-preview";
import type { UseMockGeneratorReturn } from "./use-mock-generator";
import type { MockWizardStep } from "./types";

// ── Steps ─────────────────────────────────────────────────────────────────────

const STEPS: Array<{ key: MockWizardStep; label: string }> = [
  { key: "source", label: "Source" },
  { key: "configure", label: "Configure" },
  { key: "review", label: "Endpoints" },
  { key: "preview", label: "Preview" },
];

// ── Component ─────────────────────────────────────────────────────────────────

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
              <StepDot
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
          {state.step === "source" && (
            <SourceStep wizard={wizard} />
          )}
          {state.step === "configure" && (
            <ConfigureStep wizard={wizard} />
          )}
          {state.step === "review" && (
            <ReviewStep wizard={wizard} />
          )}
          {state.step === "preview" && (
            <PreviewStep wizard={wizard} />
          )}

          {error && (
            <p className="mt-3 text-body-sm text-destructive">{error}</p>
          )}
        </div>

        <WizardFooter wizard={wizard} currentIdx={currentIdx} />
      </DialogContent>
    </Dialog>
  );
}

// ── Step Dot ──────────────────────────────────────────────────────────────────

interface StepDotProps {
  label: string;
  index: number;
  active: boolean;
  completed: boolean;
  onClick?: () => void;
}

function StepDot({ label, index, active, completed, onClick }: StepDotProps): React.ReactElement {
  return (
    <>
      {index > 0 && (
        <div className={cn("h-px flex-1 transition-colors", completed ? "bg-accent-brand" : "bg-border-subtle")} />
      )}
      <button
        type="button"
        disabled={!onClick}
        onClick={onClick}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium transition-all",
          active && "bg-accent-brand/15 text-accent-brand ring-1 ring-accent-brand/30",
          completed && "text-accent-brand cursor-pointer hover:bg-accent-brand/10",
          !active && !completed && "text-muted-foreground",
        )}
      >
        <span
          className={cn(
            "flex size-4 items-center justify-center rounded-full text-[9px] font-bold",
            active && "bg-accent-brand text-white",
            completed && "bg-accent-brand/20 text-accent-brand",
            !active && !completed && "bg-muted/60 text-muted-foreground",
          )}
        >
          {completed ? "✓" : index + 1}
        </span>
        {label}
      </button>
    </>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function WizardFooter({
  wizard,
  currentIdx,
}: {
  wizard: UseMockGeneratorReturn;
  currentIdx: number;
}): React.ReactElement {
  const { state, loading } = wizard;
  const canProceed = state.selectedSources.length > 0 || state.standalone;

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
