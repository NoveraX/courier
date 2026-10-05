/**
 * Preview view — shows what the manage operation will change on disk.
 */

import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { PlanConsent } from "@/features/apis/types-file-plan";
import { FilePlanView } from "./file-plan-view";
import type { ManagePreviewResult } from "./types";

interface ManagePreviewProps {
  preview: ManagePreviewResult;
  /** The previewed plan, with the pending steps allowed so far. */
  consent: PlanConsent | null;
  onToggleConfirmed: (path: string) => void;
}

/**
 * What adding and removing the chosen endpoints does: the endpoints whose
 * edits go with them, the import's files as Studio plans to change them,
 * and the schemas nothing uses any more.
 *
 * @param props.preview - Studio's preview
 * @param props.consent - The plan and the steps allowed
 * @param props.onToggleConfirmed - Allows a pending step, or withdraws allowing it
 * @returns The preview
 */
export function ManagePreviewView({
  preview,
  consent,
  onToggleConfirmed,
}: ManagePreviewProps): React.ReactElement {
  const warnings = preview.removeResult?.modifiedEndpointsWarning ?? [];
  const orphaned = preview.removeResult?.orphanedSchemas ?? [];

  return (
    <div className="space-y-4 pt-2">
      {warnings.length > 0 && <WarningSection warnings={warnings} />}

      {consent && (
        <FilePlanView
          plan={consent.plan}
          confirmed={consent.confirmed}
          onToggle={onToggleConfirmed}
        />
      )}

      {orphaned.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-muted-foreground">
            Schemas no endpoint uses any more, removed
          </h4>
          <div className="flex flex-wrap gap-1">
            {orphaned.map((name) => (
              <Badge key={name} variant="secondary" className="text-caption">
                {name}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WarningSection({ warnings }: { warnings: string[] }): React.ReactElement {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-3.5 text-amber-400" />
        <span className="text-xs font-medium text-amber-300">
          You edited these endpoints; removing them removes your edits too
        </span>
      </div>
      <p className="pl-5.5 text-body-sm text-muted-foreground">
        Studio keeps a copy of each file it changes.
      </p>
      <ul className="space-y-0.5 pl-5.5">
        {warnings.map((name) => (
          <li key={name} className="mono-sm text-amber-300/80">
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}
