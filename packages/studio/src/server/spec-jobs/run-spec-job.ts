import { diffSpecs, generateCode } from "../../apis";
import { readSpecJob } from "./read-spec-job";
import type { SpecJob, SpecJobReply } from "./spec-job-protocol";

/* What a job's refusal says when what it threw carries no message. */
const FAILED: Readonly<Record<SpecJob["kind"], string>> = {
  "spec:read": "Failed to parse spec",
  "spec:generate": "Code generation failed",
  "spec:diff": "Failed to diff specs",
};

/**
 * Do a job in the process it was given to: read a specification, generate
 * an import's code from one, or compare two. Whatever the job throws is
 * its input's fault, as the routes that ran it in Studio's own thread
 * answered it, and the reply says why.
 *
 * @param job - What to do, and what with
 * @returns The result, or why the input has none
 * @example
 * ```ts
 * runSpecJob({ kind: "spec:diff", oldSpec, newSpec }); // → { kind: "spec:diff", diff: { added: […], … } }
 * ```
 */
export function runSpecJob(job: SpecJob): SpecJobReply {
  try {
    return resultOf(job);
  } catch (error) {
    const refused =
      error instanceof Error && error.message !== "" ? error.message : FAILED[job.kind];
    return { kind: job.kind, refused };
  }
}

function resultOf(job: SpecJob): SpecJobReply {
  switch (job.kind) {
    case "spec:read":
      return readSpecJob(job);
    case "spec:generate":
      return { kind: job.kind, files: generateCode(job.spec, job.options) };
    case "spec:diff":
      return { kind: job.kind, diff: diffSpecs(job.oldSpec, job.newSpec) };
  }
}
