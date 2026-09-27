/**
 * The import wizard's buttons: Back, and the step's own action — parse,
 * configure, preview, write, or Done once the files are written.
 */

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { UseImportReturn } from "./use-import";
import type { ImportState } from "./types";
import { countSelectedEndpoints } from "./helpers";

/* A write Studio refused names what the next one does: allowed steps, or a fresh plan once blocked files are dealt with. */
function writeLabel({ consent }: ImportState): string {
  if (consent === null) return "Write to Disk";
  return consent.plan.blocked.length > 0 ? "Try Again" : "Write as Allowed";
}

interface WizardFooterProps {
  wizard: UseImportReturn;
}

export function WizardFooter({ wizard }: WizardFooterProps): React.ReactElement {
  const { state, parsing } = wizard;
  const selectedCount = countSelectedEndpoints(state.selectedEndpoints);

  return (
    <div className="flex items-center justify-between border-t bg-muted rounded-b-lg px-6 py-4">
      {state.step === "import" || state.step === "declare" ? (
        <span />
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const prev = state.step === "select" ? "import"
              : state.step === "options" ? "select"
              : "options";
            wizard.goToStep(prev);
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
          {writeLabel(state)}
        </Button>
      )}

      {state.step === "declare" && (
        <Button size="sm" onClick={wizard.close}>
          Done
        </Button>
      )}
    </div>
  );
}
