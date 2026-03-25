import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import type { UseImportReturn } from "./use-import";
import { ImportStepView } from "./import-step";
import { SelectStepView } from "./select-step";
import { OptionsStepView } from "./options-step";
import { PreviewStepView } from "./preview-step";
import { countSelectedEndpoints } from "./helpers";

import type { ImportStep } from "./types";

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
  const currentIdx = STEPS.findIndex((s) => s.key === state.step);

  return (
    <Dialog open={wizard.open} onOpenChange={(open) => { if (!open) wizard.close(); }}>
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
                onClick={i < currentIdx ? () => wizard.goToStep(step.key) : undefined}
              />
            ))}
          </div>
        </DialogHeader>

        {/* Scrollable content */}
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
            />
          )}
        </div>

        {/* Fixed footer */}
        <WizardFooter wizard={wizard} />
      </DialogContent>
    </Dialog>
  );
}

// ── Wizard footer ────────────────────────────────────────────────────────────

function WizardFooter({ wizard }: { wizard: UseImportReturn }): React.ReactElement {
  const { state, parsing } = wizard;
  const selectedCount = countSelectedEndpoints(state.selectedEndpoints);

  return (
    <div className="flex items-center justify-between border-t bg-muted rounded-b-lg px-6 py-4">
      {state.step === "import" ? (
        <span />
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const prev = state.step === "select" ? "import"
              : state.step === "options" ? "select"
              : "options";
            wizard.goToStep(prev as ImportStep);
          }}
        >
          Back
        </Button>
      )}

      {state.step === "import" && (
        <Button size="sm" disabled={!state.content.trim() || parsing} onClick={wizard.parse}>
          {parsing && <Loader2 className="mr-1.5 size-3 animate-spin" />}
          Parse Spec
        </Button>
      )}

      {state.step === "select" && (
        <Button size="sm" disabled={selectedCount === 0} onClick={() => wizard.goToStep("options")}>
          Configure ({selectedCount})
        </Button>
      )}

      {state.step === "options" && (
        <Button
          size="sm"
          disabled={parsing || !state.options.sourceName.trim()}
          onClick={wizard.preview}
        >
          {parsing && <Loader2 className="mr-1.5 size-3 animate-spin" />}
          Generate Preview
        </Button>
      )}

      {state.step === "preview" && (
        <Button size="sm" disabled={state.writing} onClick={wizard.write}>
          {state.writing && <Loader2 className="mr-1.5 size-3 animate-spin" />}
          Write to Disk
        </Button>
      )}
    </div>
  );
}

// ── Step dot ────────────────────────────────────────────────────────────────

function StepDot({ label, index, active, completed, onClick }: {
  label: string;
  index: number;
  active: boolean;
  completed: boolean;
  onClick?: () => void;
}): React.ReactElement {
  return (
    <>
      {index > 0 && (
        <div className={cn(
          "h-px flex-1 transition-colors",
          completed ? "bg-accent-brand" : "bg-border-subtle",
        )} />
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium transition-all",
          active && "bg-accent-brand/15 text-accent-brand ring-1 ring-accent-brand/30",
          completed && "text-accent-brand cursor-pointer hover:bg-accent-brand/10",
          !active && !completed && "text-muted-foreground",
        )}
      >
        <span className={cn(
          "flex size-4 items-center justify-center rounded-full text-[9px] font-bold",
          active && "bg-accent-brand text-white",
          completed && "bg-accent-brand/20 text-accent-brand",
          !active && !completed && "bg-muted/60 text-muted-foreground",
        )}>
          {completed ? "✓" : index + 1}
        </span>
        {label}
      </button>
    </>
  );
}
