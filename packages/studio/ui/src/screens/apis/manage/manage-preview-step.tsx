import { AlertTriangle, Info } from "lucide-react";
import type { ManagePreviewResult } from "@/features/apis/types";
import type { PlanConsent } from "@/features/apis/types-file-plan";
import { FilePlanSections } from "../file-plan-sections";

interface ManagePreviewStepProps {
  preview: ManagePreviewResult;
  consent: PlanConsent | null;
  /** Whether the plan writes every file again from the spec. */
  regenerating?: boolean;
  onToggleConfirmed: (path: string) => void;
}

/**
 * The Review step: the endpoints the user edited that a removal takes with
 * it, Studio's plan for the files, and the schemas no endpoint uses any
 * more.
 *
 * @param props - The preview, the plan and its consent, and what allowing a change does
 * @returns The step
 * @example
 * ```tsx
 * <ManagePreviewStep preview={preview} consent={consent} onToggleConfirmed={toggle} />
 * ```
 */
export function ManagePreviewStep({
  preview,
  consent,
  regenerating = false,
  onToggleConfirmed,
}: ManagePreviewStepProps): React.ReactNode {
  const edited = preview.removeResult?.modifiedEndpointsWarning ?? [];
  const orphaned = preview.removeResult?.orphanedSchemas ?? [];
  return (
    <div className="flex flex-col gap-3.5">
      {regenerating && (
        <p className="m-0 text-small text-fg-muted">
          Every file is written again from the specification, as this version of Studio writes it.
          Your edits to endpoints stay.
        </p>
      )}
      {edited.length > 0 && (
        <section
          aria-label="Edited endpoints"
          className="flex flex-col gap-1.5 rounded-panel bg-warn-dim p-3"
        >
          <h4 className="m-0 flex items-center gap-1.5 text-small font-strong text-warn">
            <AlertTriangle aria-hidden="true" className="size-3.5" />
            You edited these endpoints; removing them removes your edits too
          </h4>
          {edited.map((name) => (
            <span key={name} className="font-mono text-small text-fg-muted">
              {name}
            </span>
          ))}
        </section>
      )}
      {consent && (
        <FilePlanSections
          plan={consent.plan}
          confirmed={consent.confirmed}
          onToggle={onToggleConfirmed}
        />
      )}
      {orphaned.length > 0 && (
        <section aria-label="Schemas removed" className="flex flex-col gap-1.5">
          <h4 className="m-0 text-small font-strong">Schemas no endpoint uses any more, removed</h4>
          <div className="flex flex-wrap gap-1">
            {orphaned.map((name) => (
              <span
                key={name}
                className="rounded-chip bg-raised px-1.75 py-0.5 font-mono text-badge text-fg-muted"
              >
                {name}
              </span>
            ))}
          </div>
        </section>
      )}
      <p className="m-0 flex items-center gap-2 rounded-[9px] bg-inset px-3 py-2.5 text-small text-fg-muted">
        <Info aria-hidden="true" className="size-3.25 shrink-0 text-fg-subtle" />
        Studio merges the changes into files you edited, and keeps a copy of every file it replaces
        or removes.
      </p>
    </div>
  );
}
