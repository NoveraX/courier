import { Loader2, Trash2 } from "lucide-react";

import type { UseRemoveImportReturn } from "@/apis/use-remove-import";
import { DialogFrame } from "@/design/dialog-frame";
import { FilePlanSections } from "./file-plan-sections";
import { RemoveConfigSection } from "./remove-config-section";

function Body({ removal }: { removal: UseRemoveImportReturn }): React.ReactNode {
  const { consent, loading, error } = removal;
  if (loading) {
    return (
      <p className="flex items-center justify-center gap-2 py-10 text-control text-fg-subtle">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        Studio is planning the removal…
      </p>
    );
  }
  const nothing =
    consent !== null && consent.plan.removals.length === 0 && consent.plan.pending.length === 0;
  return (
    <div className="flex flex-col gap-3.5">
      {error && (
        <p role="alert" className="m-0 rounded-panel bg-err-dim px-3 py-2.5 text-control text-err">
          {error}
        </p>
      )}
      <RemoveConfigSection removal={removal} />
      {nothing && (
        <p className="m-0 text-control text-fg-muted">
          No file Studio wrote for it is left; removing forgets the import.
        </p>
      )}
      {consent && (
        <FilePlanSections
          plan={consent.plan}
          confirmed={consent.confirmed}
          onToggle={removal.toggleConfirmed}
        />
      )}
    </div>
  );
}

/**
 * Remove an import: the change Studio makes to the config first, what it
 * would delete, the files waiting for the user's leave, and Remove.
 *
 * @param props - The removal from `useRemoveImport`
 * @returns The dialog
 * @example
 * ```tsx
 * const removal = useRemoveImport(onRemoved);
 * <RemoveImportDialog removal={removal} />
 * ```
 */
export function RemoveImportDialog({
  removal,
}: {
  removal: UseRemoveImportReturn;
}): React.ReactNode {
  const ready = removal.consent !== null && !removal.loading && !removal.removing;
  return (
    <DialogFrame
      open={removal.name !== null}
      onClose={() => !removal.removing && removal.close()}
      keepOpen={removal.removing}
      closable={!removal.removing}
      title={`Remove ${removal.name ?? ""}`}
      description="Studio keeps a copy of every file it removes."
      icon={{ icon: Trash2, tone: "bg-err-dim text-err" }}
      width="w-160"
      footer={
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line bg-panel-subtle px-5 py-3">
          <button
            type="button"
            disabled={removal.removing}
            onClick={removal.close}
            className="flex h-8 cursor-pointer items-center rounded-card border border-line px-3.5 text-control text-fg-muted hover:border-line-strong hover:text-fg disabled:cursor-default disabled:opacity-50 pointer-coarse:h-10"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => void removal.confirm()}
            className="flex h-8 cursor-pointer items-center gap-1.75 rounded-card bg-err px-3.5 text-control font-semibold text-bg hover:bg-err/90 disabled:cursor-default disabled:opacity-50 pointer-coarse:h-10"
          >
            {removal.removing && <Loader2 aria-hidden="true" className="size-3.25 animate-spin" />}
            Remove
          </button>
        </div>
      }
    >
      <Body removal={removal} />
    </DialogFrame>
  );
}
