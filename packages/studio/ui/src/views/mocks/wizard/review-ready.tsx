import { AlertTriangle } from "lucide-react";
import { ConfigDiff } from "./config-diff";
import { WarningList } from "./warning-list";
import type { ReadyOutcome } from "./wire-types";

interface ReviewReadyProps {
  outcome: ReadyOutcome;
  mockCount: number;
  /** Whether the project changed since the plan shown before, so this one differs from it. */
  changedOnDisk: boolean;
}

/**
 * A ready plan: the exact change to the mocks file — the new entries and
 * whatever the file needs to hold them, such as an import — what else it
 * changes, and, when the project changed since the plan shown before, that
 * this is the change against the project as it is now. Nothing is written until
 * the footer's button is clicked.
 *
 * @param props - The plan, how many mocks it adds, and whether it replaced an earlier one
 * @returns The review
 *
 * @example
 * ```tsx
 * <ReviewReady outcome={plan.outcome} mockCount={plan.mocks.length} changedOnDisk={plan.changedOnDisk} />
 * ```
 */
export function ReviewReady({
  outcome,
  mockCount,
  changedOnDisk,
}: ReviewReadyProps): React.ReactElement {
  const mocks = `${mockCount} mock${mockCount !== 1 ? "s" : ""}`;
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h3 className="text-h3">Review the change</h3>
        <p className="text-body-sm text-muted-foreground">
          {outcome.creates
            ? `Creates ${outcome.target} with ${mocks}.`
            : `Adds ${mocks} to ${outcome.target}, with every line it changes shown below.`}
        </p>
      </div>
      {changedOnDisk && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-body-xs text-amber-400"
        >
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          The project changed after the last preview. This is the change against it as it is now.
        </p>
      )}
      <ConfigDiff target={outcome.target} hunks={outcome.hunks} />
      <WarningList warnings={outcome.warnings} />
      <p className="text-body-xs text-muted-foreground/60">
        After writing, Studio loads the file and checks the new mocks; if they do not check out, it
        puts the file back as it was.
      </p>
    </div>
  );
}
