import { CircleCheck, CircleX } from "lucide-react";

import type { PlannedChecks } from "@/features/tests/recorded-test-plan";

/**
 * The calls checked against the definition as it is now, before anything
 * is written: how many still fit, and each call that does not with what
 * broke it — the test would fail on it from its first run.
 *
 * @param props - The checks, and how many calls there are
 * @returns The section
 * @example
 * ```tsx
 * <PlanChecks checks={plan.checks} calls={plan.calls} />
 * ```
 */
export function PlanChecks({
  checks,
  calls,
}: {
  checks: PlannedChecks;
  calls: number;
}): React.ReactNode {
  const { fits, broken, unchecked, failures } = checks;
  return (
    <section aria-label="Checked now" className="flex flex-col gap-2">
      <h4 className="m-0 flex items-center gap-1.5 text-small font-strong">
        {broken === 0 ? (
          <CircleCheck aria-hidden="true" className="size-3.25 text-ok" />
        ) : (
          <CircleX aria-hidden="true" className="size-3.25 text-err" />
        )}
        {broken === 0
          ? `All ${calls} calls fit the definition as it is now`
          : `${broken} of ${calls} calls no longer fit the definition: the test fails on them from its first run`}
      </h4>
      {unchecked > 0 && (
        <p className="m-0 text-small text-fg-muted">
          {unchecked} call{unchecked === 1 ? " has" : "s have"} a part that cannot be checked — a
          body recorded only in part, or an answer a reshaping schema refuses.
        </p>
      )}
      {failures.length > 0 && (
        <ul
          aria-label="Calls that no longer fit"
          className="m-0 flex max-h-44 list-none flex-col overflow-auto rounded-panel border border-err/30 p-0"
        >
          {failures.map(({ at, label, problems }) => (
            <li
              key={at}
              className="flex flex-col gap-0.5 border-b border-line px-3 py-2 last:border-b-0"
            >
              <span className="truncate font-mono text-small">
                <span className="text-fg-subtle">#{at} </span>
                {label}
              </span>
              {problems.map((problem) => (
                <span key={problem} className="text-small text-err">
                  {problem}
                </span>
              ))}
            </li>
          ))}
        </ul>
      )}
      {fits > 0 && broken > 0 && (
        <p className="m-0 text-small text-fg-subtle">The other {fits} still fit.</p>
      )}
    </section>
  );
}
