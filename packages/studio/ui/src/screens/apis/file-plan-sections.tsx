import { Ban } from "lucide-react";

import { KEPT_LABEL, pendingLabel, writeLabel } from "@/features/apis/file-plan-labels";
import type { FilePlanSummary } from "@/features/apis/types-file-plan";
import { TickBox } from "./import/tick-box";

function FileList({
  title,
  rows,
}: {
  title: string;
  rows: readonly { path: string; note: string }[];
}): React.ReactNode {
  if (rows.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-1.5">
      <h4 className="m-0 text-small font-strong">{title}</h4>
      {rows.map(({ path, note }) => (
        <div key={path} className="flex items-center gap-2">
          <span className="min-w-0 truncate font-mono text-small text-fg-muted">{path}</span>
          <span className="ml-auto shrink-0 text-badge text-fg-subtle">{note}</span>
        </div>
      ))}
    </section>
  );
}

interface FilePlanSectionsProps {
  plan: FilePlanSummary;
  confirmed: readonly string[];
  onToggle: (path: string) => void;
}

/**
 * Studio's plan for the files a write touches: the ones it cannot write,
 * the changes waiting for the user to allow them, and what it writes,
 * removes and leaves alone.
 *
 * @param props - The plan, the changes allowed, and what allowing one does
 * @returns The plan
 * @example
 * ```tsx
 * <FilePlanSections plan={consent.plan} confirmed={consent.confirmed} onToggle={toggle} />
 * ```
 */
export function FilePlanSections({
  plan,
  confirmed,
  onToggle,
}: FilePlanSectionsProps): React.ReactNode {
  const writes = plan.writes.flatMap(({ path, action, was }) =>
    action === "unchanged" ? [] : [{ path, note: writeLabel(action, was) }],
  );
  const unchanged = plan.writes.filter((w) => w.action === "unchanged").length;
  return (
    <div className="flex flex-col gap-3.5 rounded-[11px] border border-line p-3.5">
      {plan.blocked.length > 0 && (
        <section
          aria-label="Files Studio cannot write"
          className="flex flex-col gap-1.5 rounded-panel bg-err-dim p-3"
        >
          <h4 className="m-0 flex items-center gap-1.5 text-small font-strong text-err">
            <Ban aria-hidden="true" className="size-3" />
            Studio cannot write these files
          </h4>
          <p className="m-0 text-small text-fg-muted">
            Each is a link or not a file. Move it out of the way, then try again; nothing was
            written.
          </p>
          {plan.blocked.map(({ path, reason }) => (
            <span key={path} className="truncate font-mono text-small">
              {path}{" "}
              <span className="text-fg-subtle">
                ({reason === "link" ? "a link" : "not a file"})
              </span>
            </span>
          ))}
        </section>
      )}
      {plan.blocked.length === 0 && plan.pending.length > 0 && (
        <section aria-label="Files that wait for you" className="flex flex-col gap-2">
          <h4 className="m-0 text-small font-strong">Allow each change you want</h4>
          <p className="m-0 text-small text-fg-muted">
            A file left unticked stays as it is. Studio keeps a copy of every file it replaces or
            removes.
          </p>
          {plan.pending.map((step) => (
            <label key={step.path} className="flex cursor-pointer items-start gap-2">
              <span className="pt-0.5">
                <TickBox
                  checked={confirmed.includes(step.path)}
                  label={`Allow ${step.path}`}
                  onChange={() => onToggle(step.path)}
                />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-mono text-small">{step.path}</span>
                <span className="text-small text-fg-subtle">{pendingLabel(step)}</span>
              </span>
            </label>
          ))}
        </section>
      )}
      <FileList title="Written" rows={writes} />
      <FileList
        title="Removed, with a copy kept"
        rows={plan.removals.map(({ path }) => ({ path, note: "removed" }))}
      />
      <FileList
        title="Left as they are"
        rows={plan.kept.map(({ path, reason }) => ({ path, note: KEPT_LABEL[reason] }))}
      />
      {unchanged > 0 && (
        <p className="m-0 text-small text-fg-subtle">
          {unchanged === 1 ? "1 file is" : `${unchanged} files are`} already as Studio would write
          it.
        </p>
      )}
    </div>
  );
}
