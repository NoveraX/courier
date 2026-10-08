import type { RecordingCheck } from "@noverax/courier-mock/testing";

/* The failures a plan shows: enough to see what broke, never a wall. */
const SHOWN_FAILURES = 50;

/** The calls checked against the definition, counted, with the failures that show. */
export interface CheckSummary {
  /** Calls the definition still fits */
  fits: number;
  /** Calls it no longer fits */
  broken: number;
  /** Calls with a part that could not be checked */
  unchecked: number;
  /** The first of the broken calls, each by its place among the calls, with what broke it */
  failures: Array<{ at: number; label: string; problems: string[] }>;
}

/**
 * Count a test's checks, and say what broke each of the first broken calls
 * — each schema's refusals by place.
 *
 * @param checks - The checks, as `verifyRecordings` returns them
 * @returns The summary
 * @example
 * ```ts
 * checkSummary(await verifyRecordings(sources, recordings)).broken; // → 0
 * ```
 */
export function checkSummary(checks: readonly RecordingCheck[]): CheckSummary {
  const broken = checks.filter((check) => check.problems.length > 0);
  return {
    fits: checks.length - broken.length,
    broken: broken.length,
    unchecked: checks.filter((check) => check.unchecked.length > 0).length,
    failures: broken.slice(0, SHOWN_FAILURES).map((check) => ({
      at: check.at,
      label: check.label,
      problems: check.problems.map((problem) =>
        problem.issues
          ? `${problem.message}: ${problem.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`
          : problem.message,
      ),
    })),
  };
}
