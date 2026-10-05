import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import type { RemovalConfigNotes } from "@/apis/client-file-changes";
import type { UseRemoveImportReturn } from "@/apis/use-remove-import";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FilePlanView } from "./file-plan-view";

function ConfigNotes({
  name,
  notes,
}: {
  name: string;
  notes: RemovalConfigNotes;
}): React.ReactElement | null {
  const config = notes.configFile ?? "courier.config";
  if (notes.configImports.length === 0 && !notes.importDeclared) return null;
  return (
    <section
      className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3"
      aria-label="courier.config"
    >
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-amber-300">
        <AlertTriangle className="size-3" />
        Studio leaves {config} as it is
      </h4>
      {notes.configImports.length > 0 && (
        <div className="space-y-1">
          <p className="text-body-sm text-muted-foreground">
            {config} imports these files. Once they are gone it stops loading, until you remove
            those imports too:
          </p>
          <ul className="space-y-0.5">
            {notes.configImports.map((path) => (
              <li key={path} className="mono-sm text-foreground">
                {path}
              </li>
            ))}
          </ul>
        </div>
      )}
      {notes.importDeclared && (
        <p className="text-body-sm text-muted-foreground">
          It still declares <span className="mono-sm text-foreground">imports.{name}</span>: remove
          that entry too, or Studio goes on checking the import for updates.
        </p>
      )}
    </section>
  );
}

function Body({ removal }: { removal: UseRemoveImportReturn }): React.ReactElement {
  const { name, consent, notes, loading, error } = removal;
  if (loading)
    return <Loader2 className="mx-auto my-8 size-5 animate-spin text-muted-foreground" />;
  const nothing =
    consent !== null && consent.plan.removals.length === 0 && consent.plan.pending.length === 0;
  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      )}
      {name !== null && notes && <ConfigNotes name={name} notes={notes} />}
      {nothing && (
        <p className="text-body-sm text-muted-foreground">
          No file Studio wrote for it is left; removing forgets the import.
        </p>
      )}
      {consent && (
        <FilePlanView
          plan={consent.plan}
          confirmed={consent.confirmed}
          onToggle={removal.toggleConfirmed}
        />
      )}
    </div>
  );
}

/**
 * Confirm removing an import: what goes into the backup, what waits for
 * the user to allow and what stays, and what courier.config still holds of
 * it. Nothing is removed before Remove.
 *
 * @param props.removal - The dialog's state and actions
 * @returns The dialog
 * @example
 * ```tsx
 * <RemoveImportDialog removal={useRemoveImport(onRemoved)} />
 * ```
 */
export function RemoveImportDialog({
  removal,
}: {
  removal: UseRemoveImportReturn;
}): React.ReactElement {
  const ready = removal.consent !== null && !removal.loading && !removal.removing;
  return (
    <Dialog
      open={removal.name !== null}
      onOpenChange={(open) => {
        if (!open && !removal.removing) removal.close();
      }}
    >
      <DialogContent className="p-0 sm:max-w-[640px] max-h-[80vh] flex flex-col">
        <DialogHeader className="px-6 pt-5 shrink-0">
          <DialogTitle className="text-balance flex items-center gap-2">
            <Trash2 className="size-4 text-rose-400" />
            Remove {removal.name}
          </DialogTitle>
          <DialogDescription>Studio keeps a copy of every file it removes.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <Body removal={removal} />
        </div>
        <div className="flex items-center justify-end gap-2 border-t bg-muted rounded-b-lg px-6 py-4 shrink-0">
          <Button variant="outline" size="sm" disabled={removal.removing} onClick={removal.close}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={!ready}
            onClick={() => void removal.confirm()}
          >
            {removal.removing && <Loader2 className="mr-1.5 size-3 animate-spin" />}
            Remove
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
