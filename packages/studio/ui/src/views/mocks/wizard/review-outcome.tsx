import type { ApplyState } from "./types";

import { CodeBlock } from "@/components/shared/code-block";
import { InsertedLinesList } from "./inserted-lines-list";

type ShownOutcome = Extract<ApplyState, { status: "failed" | "rolledBack" | "notVerified" | "rollbackFailed" }>;

function Panel({ title, detail }: { title: string; detail: string }): React.ReactElement {
  return (
    <div role="alert" className="space-y-1 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2">
      <p className="text-body-sm text-rose-400">{title}</p>
      <p className="whitespace-pre-wrap mono-xs text-rose-400/80">{detail}</p>
    </div>
  );
}

/**
 * What came of an apply that did not add the mocks: no answer from Studio,
 * which may or may not have written the file; an edit Studio wrote and took
 * back, with the snippet to add by hand once the cause is fixed; or an edit
 * it could not take back — the file changed meanwhile, or restoring it
 * failed — with the lines it added, to remove by hand.
 *
 * @param props.outcome - The apply's outcome
 * @param props.target - The mocks file the plan named, for an outcome that names none
 * @returns The explanation
 *
 * @example
 * ```tsx
 * <ReviewOutcome outcome={state.apply} target={plan.outcome.target} />
 * ```
 */
export function ReviewOutcome({ outcome, target }: { outcome: ShownOutcome; target: string }): React.ReactElement {
  switch (outcome.status) {
    case "failed":
      return (
        <Panel
          title={`Studio did not answer the request to add the mocks, so it may or may not have changed ${target}. Check again to see the file as it is now.`}
          detail={outcome.message}
        />
      );
    case "rolledBack":
      return (
        <div className="space-y-4">
          <Panel
            title={`Studio wrote the change, but the mocks did not check out, so it ${outcome.creates ? "removed" : "put back"} ${outcome.target}.`}
            detail={outcome.reason}
          />
          <p className="text-body-xs text-muted-foreground">Add it by hand once the cause is fixed:</p>
          <CodeBlock code={outcome.snippet} language="ts" />
        </div>
      );
    case "notVerified":
    case "rollbackFailed":
      return (
        <div className="space-y-4">
          <Panel
            title={
              outcome.status === "notVerified"
                ? `Studio wrote the change, but the mocks did not check out, and ${outcome.target} changed meanwhile, so Studio kept your save. Remove the lines it added:`
                : `Studio wrote the change, the mocks did not check out, and Studio could not put ${outcome.target} back. Remove the lines it added:`
            }
            detail={outcome.reason}
          />
          <InsertedLinesList lines={outcome.insertedLines} />
        </div>
      );
  }
}
