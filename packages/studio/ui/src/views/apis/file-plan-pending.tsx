import { Checkbox } from "@/components/ui/checkbox";
import { pendingLabel } from "./file-plan-labels";
import type { FilePlanSummary } from "./types-file-plan";

interface PendingProps {
  pending: FilePlanSummary["pending"];
  confirmed: readonly string[];
  onToggle: (path: string) => void;
}

/**
 * The steps that wait for the user, each with its own checkbox. A step left
 * unticked is not taken: its file stays as it is.
 */
export function FilePlanPending({
  pending,
  confirmed,
  onToggle,
}: PendingProps): React.ReactElement | null {
  if (pending.length === 0) return null;
  return (
    <section className="space-y-2" aria-label="Files that wait for you">
      <h4 className="text-xs font-medium text-foreground">Allow each change you want</h4>
      <p className="text-body-sm text-muted-foreground">
        A file left unticked stays as it is. Studio keeps a copy of every file it replaces or
        removes.
      </p>
      <ul className="space-y-1.5">
        {pending.map((step) => {
          const id = `plan-step-${step.path}`;
          return (
            <li key={step.path} className="flex items-start gap-2">
              <Checkbox
                id={id}
                className="mt-0.5"
                checked={confirmed.includes(step.path)}
                onCheckedChange={() => onToggle(step.path)}
              />
              <label htmlFor={id} className="min-w-0 space-y-0.5">
                <span className="mono-sm block truncate text-foreground">{step.path}</span>
                <span className="block text-body-sm text-muted-foreground">
                  {pendingLabel(step)}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
