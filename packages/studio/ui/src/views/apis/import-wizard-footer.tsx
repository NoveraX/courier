/**
 * Wizard footer with Back / Next / Submit buttons.
 *
 * Extracted from `import-wizard.tsx` so the navigation logic for each step
 * lives next to its own button block, leaving the wizard shell readable.
 */

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { UseImportReturn } from "./use-import";
import type { ImportStep } from "./types";
import { countSelectedEndpoints } from "./helpers";

interface WizardFooterProps {
  wizard: UseImportReturn;
}

export function WizardFooter({ wizard }: WizardFooterProps): React.ReactElement {
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
