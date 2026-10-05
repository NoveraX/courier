import { AlertTriangle, Copy } from "lucide-react";
import { ChangePreview } from "@/design/code/change-preview";
import { CodeLines } from "@/design/code/code-lines";
import type { ManualOutcome, ReadyOutcome } from "@/features/mocks/wizard/wire-types";
import { copyToClipboard } from "@/lib/clipboard";
import { WarningNotes } from "./wizard-notes";

/**
 * Studio's plan, ready: what it writes, a note when the project changed
 * since the plan before, the exact change, its warnings, and what Studio
 * does when the new mocks do not check out.
 *
 * @param props - The plan, how many mocks it adds, and whether the project changed since the last one
 * @returns The plan
 * @example
 * ```tsx
 * <ReadyPlan outcome={outcome} mockCount={2} changedOnDisk={false} />
 * ```
 */
export function ReadyPlan({
  outcome,
  mockCount,
  changedOnDisk,
}: {
  outcome: ReadyOutcome;
  mockCount: number;
  changedOnDisk: boolean;
}): React.ReactNode {
  const mocks = `${mockCount} mock${mockCount === 1 ? "" : "s"}`;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <h3 className="text-title font-semibold">Review the change</h3>
        <p className="text-small text-fg-subtle">
          {outcome.creates
            ? `Creates ${outcome.target} with ${mocks}.`
            : `Adds ${mocks} to ${outcome.target}, with every line it changes shown below.`}
        </p>
      </div>
      {changedOnDisk && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-panel bg-warn-dim px-3 py-2.5 text-small text-warn"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
          The project changed after the last preview. This is the change against it as it is now.
        </p>
      )}
      <ChangePreview target={outcome.target} hunks={outcome.hunks} />
      <WarningNotes warnings={outcome.warnings} />
      <p className="text-small text-fg-subtle">
        After writing, Studio loads the file and checks the new mocks; if they do not check out, it
        puts the file back as it was.
      </p>
    </div>
  );
}

/**
 * Studio's plan when it cannot write the change itself: why, and the code
 * to add by hand, to copy.
 *
 * @param props - The plan
 * @returns The plan
 * @example
 * ```tsx
 * <ManualPlan outcome={outcome} />
 * ```
 */
export function ManualPlan({ outcome }: { outcome: ManualOutcome }): React.ReactNode {
  const target = outcome.target ?? "courier.mocks.ts";
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <h3 className="text-title font-semibold">
          {outcome.creates ? `Create ${target} yourself` : `Add this to ${target} yourself`}
        </h3>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {outcome.reasons.map((reason) => (
            <li key={`${reason.code}:${reason.message}`} className="text-small text-fg-muted">
              {reason.message}{" "}
              <span className="font-mono text-badge text-fg-subtle">{reason.code}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="max-h-80 overflow-auto rounded-[11px] border border-line bg-inset">
        <CodeLines code={outcome.snippet} variant="panel" />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void copyToClipboard(outcome.snippet, "snippet")}
          className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-control border border-line px-2.5 text-small text-fg-muted hover:border-line-strong hover:text-fg"
        >
          <Copy aria-hidden="true" className="size-3" />
          Copy snippet
        </button>
        <p className="text-small text-fg-subtle">
          {outcome.retryable
            ? "Studio plans the change again by itself when the project changes, or on Check again."
            : "Studio picks the mocks up when you save the file."}
        </p>
      </div>
    </div>
  );
}
