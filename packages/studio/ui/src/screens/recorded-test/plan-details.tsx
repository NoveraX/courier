import { CodeLines } from "@/design/code/code-lines";
import type { RecordedTestPlan } from "@/features/tests/recorded-test-plan";
import { CopyButton } from "@/screens/welcome/copy-button";

function leftOutText({ unanswered, unknownSource, repeats }: RecordedTestPlan["leftOut"]): string {
  const parts = [
    unanswered > 0 && `${unanswered} with no answer to check — in flight, aborted, or a stream`,
    unknownSource > 0 && `${unknownSource} made to a source the config no longer has`,
    repeats > 0 && `${repeats} repeating a call kept, answer and all`,
  ].filter(Boolean);
  return parts.length === 0 ? "" : `Left out: ${parts.join("; ")}.`;
}

/**
 * The files a recorded test writes — each marked when it replaces one — what
 * was left out and replaced as a secret, what the project must install for
 * the test to run, and the test itself, as the project's formatter laid it out.
 *
 * @param props - The plan
 * @returns The sections
 * @example
 * ```tsx
 * <PlanDetails plan={plan} />
 * ```
 */
export function PlanDetails({ plan }: { plan: RecordedTestPlan }): React.ReactNode {
  const test = plan.files.at(-1);
  const leftOut = leftOutText(plan.leftOut);
  return (
    <>
      <section aria-label="Files" className="flex flex-col gap-1.5">
        <h4 className="m-0 text-small font-strong">
          {plan.calls} calls to {plan.endpoints} endpoint{plan.endpoints === 1 ? "" : "s"}, in
        </h4>
        {plan.files.map((file) => (
          <div key={file.path} className="flex items-center gap-2">
            <span className="min-w-0 truncate font-mono text-small">{file.path}</span>
            <span
              className={`ml-auto shrink-0 text-badge ${file.replaces ? "text-warn" : "text-fg-subtle"}`}
            >
              {file.replaces ? "replaces the file there" : "new"}
            </span>
          </div>
        ))}
        {leftOut && <p className="m-0 text-small text-fg-muted">{leftOut}</p>}
        <p className="m-0 text-small text-fg-muted">
          {plan.redactions.length === 0
            ? "No body field or query parameter was named like a secret; credential headers are never kept."
            : `Replaced as secrets, so the test leaves them alone: ${plan.redactions.join(", ")}.`}
        </p>
      </section>
      {plan.needs.map((command) => (
        <section
          key={command}
          aria-label="To install"
          className="flex flex-col gap-1.5 rounded-panel bg-warn-dim p-3"
        >
          <p className="m-0 text-small text-fg">
            The test imports what the project does not list yet:
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-small">{command}</code>
            <CopyButton text={command} />
          </div>
        </section>
      ))}
      {test && (
        <section aria-label="The test" className="flex flex-col gap-1.5">
          <h4 className="m-0 text-small font-strong">
            {test.path}
            {plan.formattedWith.length > 0 && (
              <span className="font-normal text-fg-subtle">
                {" "}
                · laid out by {plan.formattedWith.join(", ")}
              </span>
            )}
          </h4>
          <div className="max-h-64 overflow-auto rounded-panel border border-line bg-inset">
            <CodeLines code={test.content.trimEnd()} />
          </div>
        </section>
      )}
    </>
  );
}
