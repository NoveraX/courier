import { isPlainObject } from "@/socket/is-plain-object";

/** A file a recorded test writes. */
export interface PlannedTestFile {
  path: string;
  content: string;
  /** A file is there already, which writing replaces */
  replaces: boolean;
}

/** The calls checked against the definition now. */
export interface PlannedChecks {
  fits: number;
  broken: number;
  unchecked: number;
  /** Each broken call by its place among the calls, from 1 */
  failures: Array<{ at: number; label: string; problems: string[] }>;
}

/** What saving the requests as a test writes and finds, as Studio planned it. */
export interface RecordedTestPlan {
  title: string;
  files: PlannedTestFile[];
  calls: number;
  endpoints: number;
  leftOut: { unanswered: number; unknownSource: number; repeats: number };
  redactions: string[];
  checks: PlannedChecks;
  /** Commands that install what the test imports and the project lacks */
  needs: string[];
  formattedWith: string[];
  digest: string;
}

/**
 * Read the plan Studio sent for a recorded test.
 *
 * @param value - What Studio answered
 * @returns The plan, or `undefined` for anything else
 * @example
 * ```ts
 * planOf(await post("/api/tests/plan", body))?.files.length;
 * ```
 */
export function planOf(value: unknown): RecordedTestPlan | undefined {
  if (!isPlainObject(value) || typeof value.digest !== "string") return undefined;
  const { files, checks, leftOut } = value;
  if (!Array.isArray(files) || !files.every(isFile)) return undefined;
  if (!isPlainObject(checks) || !isPlainObject(leftOut)) return undefined;
  return {
    title: String(value.title),
    files,
    calls: count(value.calls),
    endpoints: count(value.endpoints),
    leftOut: {
      unanswered: count(leftOut.unanswered),
      unknownSource: count(leftOut.unknownSource),
      repeats: count(leftOut.repeats),
    },
    redactions: strings(value.redactions),
    checks: {
      fits: count(checks.fits),
      broken: count(checks.broken),
      unchecked: count(checks.unchecked),
      failures: Array.isArray(checks.failures)
        ? checks.failures.filter(isPlainObject).map((failure) => ({
            at: count(failure.at),
            label: String(failure.label),
            problems: strings(failure.problems),
          }))
        : [],
    },
    needs: strings(value.needs),
    formattedWith: strings(value.formattedWith),
    digest: value.digest,
  };
}

function isFile(value: unknown): value is PlannedTestFile {
  return (
    isPlainObject(value) &&
    typeof value.path === "string" &&
    typeof value.content === "string" &&
    typeof value.replaces === "boolean"
  );
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
