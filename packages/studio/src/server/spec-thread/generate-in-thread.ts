import type { GeneratedFile, GenerateOptions, ParsedSpec } from "../../apis";
import { runInThread } from "./run-in-thread";
import type { SpecGenerateJob } from "./spec-thread-protocol";
import type { SpecWorkOptions } from "./spec-work-options";
import { SpecWorkRefusedError } from "./spec-work-refused-error";
import { TRUSTED_JOB, VISITOR_GENERATE } from "./thread-budgets";
import { inThreadPlace } from "./thread-places";

/**
 * Generate an import's code from a parsed specification in a thread of
 * its own, as `generateCode` does in Studio's: a specification of several
 * megabytes takes a second or more to generate, which would hold up every
 * other request the server answers. The thread is ended once the code is
 * generated, once it takes longer or more memory than its budget, and once
 * the caller goes away.
 *
 * A caller without the token is served in one of the few places Studio
 * keeps for such callers — the places its reads take too — or refused
 * while they are taken; a caller with it waits its turn.
 *
 * @param spec - The parsed specification, as the route was sent it
 * @param options - The generator's options, as the route resolved them
 * @param work - Whether the caller holds the project's token, its signal, and its budget
 * @returns The files, each with its project-relative path
 * @throws {SpecWorkRefusedError} `CODE_NOT_GENERATED` when the generator refuses the specification or the options
 * @throws {SpecWorkLimitError} When generating takes longer or more memory than the budget
 * @throws {StudioBusyError} When Studio already works on as many for callers without the token as it takes
 * @throws {StudioThreadError} When Studio's thread script is from another build or missing, or the thread fails
 * @example
 * ```ts
 * const files = await generateInThread(body.spec, options, { trusted: false, signal: work.signal });
 * res.json({ files });
 * ```
 */
export async function generateInThread(
  spec: ParsedSpec,
  options: GenerateOptions,
  { trusted, signal, budget }: SpecWorkOptions,
): Promise<GeneratedFile[]> {
  const job: SpecGenerateJob = { kind: "spec:generate", spec, options };
  const within = budget ?? (trusted ? TRUSTED_JOB : VISITOR_GENERATE);
  const reply = await inThreadPlace(trusted, signal, () => runInThread(job, within, signal));
  if ("files" in reply) return reply.files;
  throw new SpecWorkRefusedError("CODE_NOT_GENERATED", reply.refused);
}
