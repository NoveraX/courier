import type { ParsedSpec, SpecDiff } from "../../apis";
import { jsonText } from "../../apis/registry/json-text";
import { TRUSTED_JOB, VISITOR_DIFF } from "./job-budgets";
import { inJobPlace } from "./job-places";
import { runInProcess } from "./run-in-process";
import type { SpecDiffJob } from "./spec-job-protocol";
import type { SpecWorkOptions } from "./spec-work-options";
import { SpecWorkRefusedError } from "./spec-work-refused-error";

/**
 * Compare two parsed specifications in a process of its own, as `diffSpecs`
 * does in Studio's: two specifications of several megabytes take a while
 * to compare, which would hold up every other request the server answers.
 * The process is stopped once they are compared, once it takes longer or more
 * memory than its budget, and once the caller goes away.
 *
 * A caller without the token is served in one of the few places Studio
 * keeps for such callers — the places its reads take too — or refused
 * while they are taken; a caller with it waits its turn.
 *
 * @param oldSpec - The specification an import was generated from
 * @param newSpec - The one to compare it with
 * @param work - Whether the caller holds the project's token, its signal, and its budget
 * @returns The endpoints added, removed and changed, the schemas changed, and what breaks
 * @throws {SpecWorkRefusedError} `SPECS_NOT_COMPARED` when the specifications cannot be compared
 * @throws {SpecWorkLimitError} When comparing takes longer or more memory than the budget
 * @throws {StudioBusyError} When Studio already works on as many for callers without the token as it takes
 * @throws {StudioWorkerError} When Studio's worker script is from another build or missing, or the process fails
 * @example
 * ```ts
 * res.json(await diffInProcess(body.oldSpec, body.newSpec, { trusted: false, signal: work.signal }));
 * ```
 */
export async function diffInProcess(
  oldSpec: ParsedSpec,
  newSpec: ParsedSpec,
  { trusted, signal, budget }: SpecWorkOptions,
): Promise<SpecDiff> {
  const job: SpecDiffJob = {
    kind: "spec:diff",
    oldJson: jsonText(oldSpec) ?? "null",
    newJson: jsonText(newSpec) ?? "null",
  };
  const within = budget ?? (trusted ? TRUSTED_JOB : VISITOR_DIFF);
  const reply = await inJobPlace(trusted, signal, () => runInProcess(job, within, signal));
  if ("diff" in reply) return reply.diff;
  throw new SpecWorkRefusedError("SPECS_NOT_COMPARED", reply.refused);
}
