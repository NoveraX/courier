import { diffSpecs, generateCode, type ParsedSpec } from "../../apis";
import { isParsedSpec } from "../parsed-spec-guard";
import { ranOutOfStack } from "../ran-out-of-stack";
import { readSpecJob } from "./read-spec-job";
import type { SpecJob, SpecJobReply } from "./spec-job-protocol";

/* What a job's refusal says when what it threw carries no message. */
const FAILED: Readonly<Record<SpecJob["kind"], string>> = {
  "spec:read": "Failed to parse spec",
  "spec:generate": "Code generation failed",
  "spec:diff": "Failed to diff specs",
};

/* What it says when the work ran out of stack: the specification nests deeper than the work goes. */
const TOO_DEEP: Readonly<Record<SpecJob["kind"], string>> = {
  "spec:read": "The specification nests its schemas deeper than Studio can read",
  "spec:generate": "The specification nests its schemas deeper than Studio can generate code for",
  "spec:diff": "The specifications nest their schemas deeper than Studio can compare",
};

/**
 * Do a job in the process it was given to: read a specification, generate
 * an import's code from one, or compare two. Whatever the job throws is
 * its input's fault, as the routes that ran it in Studio's own thread
 * answered it, and the reply says why — that the specification nests too
 * deep, where the work ran out of stack on it.
 *
 * @param job - What to do, and what with
 * @returns The result, or why the input has none
 * @example
 * ```ts
 * runSpecJob({ kind: "spec:diff", oldJson, newJson }); // → { kind: "spec:diff", diff: { added: […], … } }
 * ```
 */
export function runSpecJob(job: SpecJob): SpecJobReply {
  try {
    return resultOf(job);
  } catch (error) {
    return { kind: job.kind, refused: refusalOf(job.kind, error) };
  }
}

function refusalOf(kind: SpecJob["kind"], error: unknown): string {
  if (ranOutOfStack(error)) return `${TOO_DEEP[kind]}.`;
  return error instanceof Error && error.message !== "" ? error.message : FAILED[kind];
}

function resultOf(job: SpecJob): SpecJobReply {
  switch (job.kind) {
    case "spec:read":
      return readSpecJob(job);
    case "spec:generate":
      return { kind: job.kind, files: generateCode(specOf(job.specJson), job.options) };
    case "spec:diff":
      return { kind: job.kind, diff: diffSpecs(specOf(job.oldJson), specOf(job.newJson)) };
  }
}

/* A specification as the JSON text Studio wrote of it holds it. */
function specOf(json: string): ParsedSpec {
  const spec: unknown = JSON.parse(json);
  if (!isParsedSpec(spec)) throw new Error("The job's specification is not one Studio parsed");
  return spec;
}
