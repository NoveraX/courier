/**
 * Unified manage dialog — reupload, inventory, preview, and apply.
 */

import { useState } from "react";
import { Loader2, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { UseManageReturn } from "./use-manage";
import { ManageInventoryView } from "./manage-inventory";
import { ManagePreviewView } from "./manage-preview";
import {
  ReuploadStep,
  parseAndContinue,
  type ReuploadStepState,
} from "./manage-reupload-step";

interface ManageDialogProps {
  manage: UseManageReturn;
}

export function ManageDialog({ manage }: ManageDialogProps): React.ReactElement {
  const [reupload, setReupload] = useState<ReuploadStepState>({
    content: "",
    parsing: false,
    error: null,
  });

  const updateReupload = (update: Partial<ReuploadStepState>) => {
    setReupload((prev) => ({ ...prev, ...update }));
  };

  const title = manage.step === "reupload"
    ? `Upload spec — ${manage.sourceName}`
    : `Manage endpoints — ${manage.sourceName}`;

  return (
    <Dialog open={manage.open} onOpenChange={(open) => { if (!open) manage.close(); }}>
      <DialogContent className="p-0 sm:max-w-[700px] max-h-[80vh] flex flex-col">
        <DialogHeader className="px-6 pt-5 shrink-0">
          <DialogTitle className="text-balance flex items-center gap-2">
            <Settings2 className="size-4 text-indigo-400" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <StepContent manage={manage} reupload={reupload} onContentChange={(c) => updateReupload({ content: c })} />
        </div>

        {manage.step !== "loading" && manage.step !== "done" && (
          <ManageFooter manage={manage} reupload={reupload} onParse={updateReupload} />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Step content ─────────────────────────────────────────────────────────────

function StepContent({ manage, reupload, onContentChange }: {
  manage: UseManageReturn;
  reupload: ReuploadStepState;
  onContentChange: (content: string) => void;
}): React.ReactElement {
  if (manage.step === "loading") {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (manage.step === "reupload") {
    return <ReuploadStep state={reupload} onContentChange={onContentChange} />;
  }

  if (manage.step === "inventory" && manage.inventory) {
    return (
      <ManageInventoryView
        inventory={manage.inventory}
        toAdd={manage.toAdd}
        toRemove={manage.toRemove}
        onToggle={manage.toggleEndpoint}
        onToggleGroup={manage.toggleGroup}
        onToggleAll={manage.toggleAll}
      />
    );
  }

  if ((manage.step === "preview" || manage.step === "applying") && manage.preview) {
    return <ManagePreviewView preview={manage.preview} />;
  }

  if (manage.error) {
    return <p className="py-8 text-center text-sm text-destructive">{manage.error}</p>;
  }

  return <div />;
}

// ── Footer ───────────────────────────────────────────────────────────────────

function ManageFooter({ manage, reupload, onParse }: {
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
        <Button variant="outline" size="sm" onClick={manage.close}>Cancel</Button>
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

      {isPreview && (
        <Button
          size="sm"
          disabled={isApplying}
          onClick={() => void manage.apply()}
        >
          {isApplying && <Loader2 className="mr-1.5 size-3 animate-spin" />}
          Apply Changes
        </Button>
      )}

      {manage.error && isPreview && (
        <p className="text-xs text-destructive">{manage.error}</p>
      )}
    </div>
  );
}
