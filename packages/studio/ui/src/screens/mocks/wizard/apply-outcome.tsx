import { CodeLines } from "@/design/code/code-lines";
import type { ApplyState } from "@/features/mocks/wizard/types";
import { InsertedLines } from "./wizard-notes";

/** The ends of an apply that leave something for the user to do. */
export type ShownOutcome = Extract<
  ApplyState,
  { status: "failed" | "rolledBack" | "notVerified" | "rollbackFailed" }
>;

function Alert({ title, detail }: { title: string; detail: string }): React.ReactNode {
  return (
    <div role="alert" className="flex flex-col gap-1 rounded-panel bg-err-dim px-3 py-2.5 text-err">
      <p className="text-control">{title}</p>
      <p className="font-mono text-small whitespace-pre-wrap opacity-80">{detail}</p>
    </div>
  );
}

/**
 * What came of an apply that did not end in new mocks: no answer, a
 * change put back with the code to add by hand, or a change left in the
 * file with the lines to remove.
 *
 * @param props - The outcome, and the file it concerns
 * @returns The outcome
 * @example
 * ```tsx
 * <ApplyOutcome outcome={apply} target="courier.mocks.ts" />
 * ```
 */
export function ApplyOutcome({
  outcome,
  target,
}: {
  outcome: ShownOutcome;
  target: string;
}): React.ReactNode {
  switch (outcome.status) {
    case "failed":
      return (
        <Alert
          title={`Studio did not answer the request to add the mocks, so it may or may not have changed ${target}. Check again to see the file as it is now.`}
          detail={outcome.message}
        />
      );
    case "rolledBack":
      return (
        <div className="flex flex-col gap-3.5">
          <Alert
            title={`Studio wrote the change, but the mocks did not check out, so it ${outcome.creates ? "removed" : "put back"} ${outcome.target}.`}
            detail={outcome.reason}
          />
          <p className="text-small text-fg-subtle">Add it by hand once the cause is fixed:</p>
          <div className="max-h-80 overflow-auto rounded-[11px] border border-line bg-inset">
            <CodeLines code={outcome.snippet} variant="panel" />
          </div>
        </div>
      );
    case "notVerified":
    case "rollbackFailed":
      return (
        <div className="flex flex-col gap-3.5">
          <Alert
            title={
              outcome.status === "notVerified"
                ? `Studio wrote the change, but the mocks did not check out, and ${outcome.target} changed meanwhile, so Studio kept your save. Remove the lines it added:`
                : `Studio wrote the change, the mocks did not check out, and Studio could not put ${outcome.target} back. Remove the lines it added:`
            }
            detail={outcome.reason}
          />
          <InsertedLines lines={outcome.insertedLines} />
        </div>
      );
  }
}
