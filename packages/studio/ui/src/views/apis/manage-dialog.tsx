/**
 * Unified manage dialog — reupload, inventory, preview, and apply.
 */

import { useEffect, useState } from "react";
import { Loader2, Settings2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { UseManageReturn } from "./use-manage";
import { ManageInventoryView } from "./manage-inventory";
import { ManagePreviewView } from "./manage-preview";
import { ManageFooter } from "./manage-footer";
import {
  ReuploadStep,
  type ReuploadStepState,
} from "./manage-reupload-step";

interface ManageDialogProps {
  manage: UseManageReturn;
}

const EMPTY_REUPLOAD: ReuploadStepState = { content: "", parsing: false, error: null };

export function ManageDialog({ manage }: ManageDialogProps): React.ReactElement {
  const [reupload, setReupload] = useState<ReuploadStepState>(EMPTY_REUPLOAD);

  /* Each opening starts from an empty spec, not the one pasted for another import. */
  useEffect(() => {
    if (manage.open) setReupload(EMPTY_REUPLOAD);
  }, [manage.open]);

  const updateReupload = (update: Partial<ReuploadStepState>) => {
    setReupload((prev) => ({ ...prev, ...update }));
  };

  const title = manage.step === "reupload"
    ? `Upload spec — ${manage.sourceName}`
    : `Manage endpoints — ${manage.sourceName}`;

  return (
    <Dialog open={manage.open} onOpenChange={(open) => { if (!open && manage.step !== "applying") manage.close(); }}>
      <DialogContent className="p-0 sm:max-w-[700px] max-h-[80vh] flex flex-col">
        <DialogHeader className="px-6 pt-5 shrink-0">
          <DialogTitle className="text-balance flex items-center gap-2">
            <Settings2 className="size-4 text-indigo-400" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          {manage.error && (
            <p role="alert" className="mb-3 rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-body-sm text-destructive">
              {manage.error}
            </p>
          )}
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

  if (manage.step === "preview" && !manage.preview && !manage.error) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if ((manage.step === "preview" || manage.step === "applying") && manage.preview) {
    return (
      <ManagePreviewView
        preview={manage.preview}
        consent={manage.consent}
        onToggleConfirmed={manage.toggleConfirmed}
      />
    );
  }

  return <div />;
}
