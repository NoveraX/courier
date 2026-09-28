import type { FilePlanSummary } from "./types-file-plan";
import { KEPT_LABEL, writeLabel } from "./file-plan-labels";
import { FilePlanBlocked } from "./file-plan-blocked";
import { FilePlanPending } from "./file-plan-pending";

interface FilePlanViewProps {
  plan: FilePlanSummary;
  /** Paths of the pending steps the user allowed. */
  confirmed: readonly string[];
  onToggle: (path: string) => void;
}

interface Row {
  path: string;
  note: string;
}

function FileList({ title, rows }: { title: string; rows: Row[] }): React.ReactElement | null {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-1.5" aria-label={title}>
      <h4 className="text-xs font-medium text-foreground">{title}</h4>
      <ul className="space-y-0.5">
        {rows.map(({ path, note }) => (
          <li key={path} className="flex items-center gap-2">
            <span className="mono-sm min-w-0 truncate text-muted-foreground">{path}</span>
            <span className="ml-auto shrink-0 text-body-xs text-muted-foreground/60">{note}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * What an operation does to an import's files, file by file, as Studio
 * planned it: the files it cannot write, the steps waiting for the user —
 * offered only when nothing blocks the plan — what it writes, what it
 * removes into the backup and what it leaves as it is. Files already as they
 * would be written are only counted.
 *
 * @param props.plan - The plan Studio sent
 * @param props.confirmed - The pending steps allowed so far
 * @param props.onToggle - Allows a pending step, or withdraws allowing it
 * @returns The plan
 * @example
 * ```tsx
 * <FilePlanView plan={consent.plan} confirmed={consent.confirmed} onToggle={toggle} />
 * ```
 */
export function FilePlanView({ plan, confirmed, onToggle }: FilePlanViewProps): React.ReactElement {
  const writes: Row[] = [];
  let unchanged = 0;
  for (const { path, action, was } of plan.writes) {
    if (action === "unchanged") unchanged += 1;
    else writes.push({ path, note: writeLabel(action, was) });
  }
  const removals = plan.removals.map(({ path }) => ({ path, note: "removed" }));
  const kept = plan.kept.map(({ path, reason }) => ({ path, note: KEPT_LABEL[reason] }));
  return (
    <div className="space-y-4">
      <FilePlanBlocked blocked={plan.blocked} />
      {/* A plan with files Studio cannot write is not applied, so nothing in it can be allowed. */}
      {plan.blocked.length === 0 && (
        <FilePlanPending pending={plan.pending} confirmed={confirmed} onToggle={onToggle} />
      )}
      <FileList title="Written" rows={writes} />
      <FileList title="Removed, with a copy kept" rows={removals} />
      <FileList title="Left as they are" rows={kept} />
      {unchanged > 0 && (
        <p className="text-body-sm text-muted-foreground">
          {unchanged === 1 ? "1 file is" : `${unchanged} files are`} already as Studio would write it.
        </p>
      )}
    </div>
  );
}
