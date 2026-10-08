import { createHash } from "node:crypto";
import { formatProjectFiles } from "../project-format/format-project-files";
import type { SavedRequest } from "../session-types";
import { type CheckSummary, checkSummary } from "./check-summary";
import { type LeftOut, recordedCalls } from "./recorded-calls";
import { testFiles } from "./test-files";
import { loadTesting, missingPackages } from "./testing-package";

/** What saving a session as a test writes and finds, to show before it is written. */
export interface RecordedTestPlan {
  title: string;
  /** Each file it writes, by project-relative path, and whether one is there already */
  files: Array<{ path: string; content: string; replaces: boolean }>;
  /** The calls the test checks */
  calls: number;
  endpoints: number;
  leftOut: LeftOut;
  redactions: string[];
  /** The calls checked against the definition now, before anything is written */
  checks: CheckSummary;
  /** The commands that install what the test imports and the project lacks */
  needs: string[];
  formattedWith: string[];
  /** What the files hold, so a write can tell they are the ones shown */
  digest: string;
}

/** What a plan is made from. */
export interface RecordedTestInput {
  title: string;
  /** The folder the files go in, project-relative */
  folder: string;
  requests: readonly SavedRequest[];
}

/** What a plan reads of the running project. */
export interface RecordedTestDeps {
  root: string;
  configFile: string;
  sources: Readonly<Record<string, unknown>>;
}

/**
 * Plan a test of a session's calls: the recordings, one HAR file per
 * source, and a vitest file that checks them against the definition — laid
 * out as the project formats its code — with the calls checked now, so the
 * person sees what fails before anything is written.
 *
 * @param input - The title, the folder, and the session's requests
 * @param deps - The project root, the config's file and its sources
 * @returns The plan
 * @throws {RecordedTestRefusal} When no call has an answer to check, or the mock package cannot load
 * @example
 * ```ts
 * const plan = await planRecordedTest({ title: "Checkout", folder: "tests/recorded", requests }, deps);
 * ```
 */
export async function planRecordedTest(
  input: RecordedTestInput,
  deps: RecordedTestDeps,
): Promise<RecordedTestPlan> {
  const testing = await loadTesting(deps.root);
  const calls = recordedCalls(input.requests, new Set(Object.keys(deps.sources)));
  const composed = testFiles(input, calls, deps, testing);
  const { files, formattedWith } = await formatProjectFiles(deps.root, composed);
  const recordings = [...calls.bySource.values()].flat();
  const checks = await testing.verifyRecordings(deps.sources, recordings);
  return {
    title: input.title,
    files: files.map(({ path, content, replaces }) => ({ path, content, replaces })),
    calls: recordings.length,
    endpoints: new Set(recordings.map((r) => `${r.source}:${r.group}.${r.method}`)).size,
    leftOut: calls.leftOut,
    redactions: calls.redactions,
    checks: checkSummary(checks),
    needs: missingPackages(deps.root),
    formattedWith,
    digest: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
  };
}
