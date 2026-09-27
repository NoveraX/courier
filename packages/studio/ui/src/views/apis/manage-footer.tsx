import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { UseManageReturn } from "./use-manage";
import { parseAndContinue, type ReuploadStepState } from "./manage-reupload-step";

/**
 * The manage dialog's buttons for the step it is on: parse an uploaded
 * spec, preview the picked endpoints, or apply the previewed plan — or
 * preview it again once the files it could not write are dealt with.
 */
export function ManageFooter({ manage, reupload, onParse }: {
  manage: UseManageReturn;
  reupload: ReuploadStepState;
  onParse: (update: Partial<ReuploadStepState>) => void;
}): React.ReactElement {
  const isReupload = manage.step === "reupload";
  const isApplying = manage.step === "applying";
  const isPreview = manage.step === "preview";
  const isInventory = manage.step === "inventory";
  const canGoBack = isPreview || (isInventory && manage.importType !== "url");

  return (
    <div className="flex items-center justify-between border-t bg-muted rounded-b-lg px-6 py-4 shrink-0">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={isApplying} onClick={manage.close}>Cancel</Button>
        {canGoBack && (
          <Button variant="outline" size="sm" onClick={manage.back}>Back</Button>
        )}
      </div>

      {isReupload && (
        <Button
          size="sm"
          disabled={!reupload.content.trim() || reupload.parsing}
          onClick={() => void parseAndContinue(
            reupload.content,
            (spec) => void manage.provideSpec(spec),
            onParse,
          )}
        >
          {reupload.parsing && <Loader2 className="mr-1.5 size-3 animate-spin" />}
          Parse & Continue
        </Button>
      )}

      {isInventory && (
        <Button size="sm" disabled={!manage.hasChanges} onClick={() => void manage.requestPreview()}>
          Preview Changes
        </Button>
      )}

      {(isPreview || isApplying) && (manage.consent?.plan.blocked.length ? (
        <Button size="sm" disabled={isApplying} onClick={() => void manage.requestPreview()}>
          Preview Again
        </Button>
      ) : (
        <Button size="sm" disabled={isApplying || manage.consent === null} onClick={() => void manage.apply()}>
          {isApplying && <Loader2 className="mr-1.5 size-3 animate-spin" />}
          Apply Changes
        </Button>
      ))}
    </div>
  );
}
