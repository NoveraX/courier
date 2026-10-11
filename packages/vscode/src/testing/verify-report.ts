/** Where a value broke a schema. */
export interface VerifyIssue {
  readonly path: string;
  readonly message: string;
}

/** A way a recorded call no longer fits the API. */
export interface VerifyProblem {
  readonly kind: string;
  readonly message: string;
  readonly issues?: readonly VerifyIssue[] | undefined;
}

/** One recorded call, checked against the API as declared now. */
export interface RecordingVerdict {
  /** Its place among the file's recordings, from 1 */
  readonly at: number;
  readonly label: string;
  readonly endpoint: string;
  readonly problems: readonly VerifyProblem[];
  readonly unchecked: readonly string[];
}

/** What `courier-studio verify --format json` reports. */
export interface VerifyReport {
  readonly files: readonly {
    readonly file: string;
    readonly checks: readonly RecordingVerdict[];
  }[];
  readonly skipped: readonly { readonly file: string; readonly reason: string }[];
}

/**
 * The report `courier-studio verify --format json` prints, read as data:
 * each file's checked calls, and the files it passed over; `undefined` for
 * output that is no such report — an error said instead.
 *
 * @param text - What the command printed
 * @returns The report, or `undefined`
 * @example
 * ```ts
 * verifyReportOf(stdout)?.files[0]?.checks.length; // 4
 * ```
 */
export function verifyReportOf(text: string): VerifyReport | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* Not the report: the command said something else, which the caller shows. */
    return undefined;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.files) || !Array.isArray(parsed.skipped))
    return undefined;
  const files = parsed.files.flatMap((file) =>
    isRecord(file) && typeof file.file === "string" && Array.isArray(file.checks)
      ? [{ file: file.file, checks: file.checks.flatMap(verdictOf) }]
      : [],
  );
  const skipped = parsed.skipped.flatMap((file) =>
    isRecord(file) && typeof file.file === "string" && typeof file.reason === "string"
      ? [{ file: file.file, reason: file.reason }]
      : [],
  );
  return { files, skipped };
}

/**
 * A problem as a test's failure says it: what changed, then each place the
 * schema refused the value.
 *
 * @param problem - The problem
 * @returns The text
 * @example
 * ```ts
 * problemText({ kind: "answer-refused", message: "The answer no longer fits", issues: [{ path: "price", message: "Expected number" }] });
 * ```
 */
export function problemText(problem: VerifyProblem): string {
  const issues = (problem.issues ?? []).map((issue) => `  ${issue.path}: ${issue.message}`);
  return [problem.message, ...issues].join("\n");
}

function verdictOf(value: unknown): RecordingVerdict[] {
  if (!isRecord(value) || typeof value.at !== "number" || typeof value.label !== "string")
    return [];
  const problems = Array.isArray(value.problems) ? value.problems.flatMap(problemOf) : [];
  const unchecked = Array.isArray(value.unchecked)
    ? value.unchecked.filter((each): each is string => typeof each === "string")
    : [];
  const endpoint = typeof value.endpoint === "string" ? value.endpoint : "";
  return [{ at: value.at, label: value.label, endpoint, problems, unchecked }];
}

function problemOf(value: unknown): VerifyProblem[] {
  if (!isRecord(value) || typeof value.message !== "string") return [];
  const issues = Array.isArray(value.issues)
    ? value.issues.flatMap((issue) =>
        isRecord(issue) && typeof issue.path === "string" && typeof issue.message === "string"
          ? [{ path: issue.path, message: issue.message }]
          : [],
      )
    : undefined;
  return [{ kind: String(value.kind ?? ""), message: value.message, issues }];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
