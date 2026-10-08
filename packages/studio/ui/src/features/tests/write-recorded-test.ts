import { toast } from "sonner";

import type { SessionFileTarget } from "@/features/sessions/session-file";
import { post } from "@/lib/api-client";
import { StudioRequestError } from "@/lib/studio-request-error";
import { isPlainObject } from "@/socket/is-plain-object";
import type { RecordedTestPlan } from "./recorded-test-plan";
import { type TestAsk, testBody } from "./use-recorded-test-plan";

/** How writing a recorded test went. */
export type WriteOutcome = "written" | "changed" | "failed";

/**
 * Write the test planned: Studio makes the plan again and writes it only
 * when it is the one shown — `changed` otherwise, so it is shown again —
 * replacing a file already there only when the person agreed to. The
 * outcome is said in a toast.
 *
 * @param target - The requests the test is made of
 * @param ask - The title and the folder typed
 * @param plan - The plan shown
 * @param replace - Whether a file already there may be replaced
 * @returns How it went
 * @example
 * ```ts
 * await writeRecordedTest({ kind: "shown" }, ask, plan, false);
 * ```
 */
export async function writeRecordedTest(
  target: SessionFileTarget,
  ask: TestAsk,
  plan: RecordedTestPlan,
  replace: boolean,
): Promise<WriteOutcome> {
  try {
    const answer = await post<unknown>("/api/tests/write", {
      ...testBody(target, ask),
      digest: plan.digest,
      replace,
    });
    const written = isPlainObject(answer) && Array.isArray(answer.written) ? answer.written : [];
    const test = written.filter((path) => typeof path === "string").at(-1) ?? "the test";
    toast.success(`Wrote ${test} and its recordings; vitest runs it with the rest`);
    return "written";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof StudioRequestError && error.code === "PLAN_CHANGED") {
      toast.info(message);
      return "changed";
    }
    toast.error(`Could not write the test: ${message}`);
    return "failed";
  }
}
