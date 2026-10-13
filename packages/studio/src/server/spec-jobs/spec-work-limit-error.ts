import { CourierError } from "@noverax/courier";

import type { SpecJob } from "./spec-job-protocol";

/* What each job is, in the words of its message. */
const WORK: Readonly<Record<SpecJob["kind"], string>> = {
  "spec:read": "reading the specification",
  "spec:generate": "generating code from the specification",
  "spec:diff": "comparing the specifications",
};

/**
 * Studio stopped a job on a specification — reading it, generating its
 * code, comparing it — that took longer, or more memory, than it gives
 * one, or did not start one it could not hand to its process: the
 * specification is what is too much, so a route answers 413.
 *
 * @example
 * ```ts
 * throw SpecWorkLimitError.time("spec:read", 20_000);
 * ```
 */
export class SpecWorkLimitError extends CourierError<"SPEC_WORK_LIMIT"> {
  /** The status a route answers with. */
  readonly httpStatus = 413;

  /**
   * The job took longer than Studio waits.
   *
   * @param kind - The job
   * @param ms - How long Studio waited
   * @returns The error
   */
  static time(kind: SpecJob["kind"], ms: number): SpecWorkLimitError {
    return new SpecWorkLimitError(
      `Studio stopped ${WORK[kind]} after ${ms / 1000} s: it takes longer than Studio gives one.`,
    );
  }

  /**
   * The job needed more memory than Studio gives one.
   *
   * @param kind - The job
   * @param mb - The memory a job may take, in megabytes
   * @param cause - How the process that ran it ended
   * @returns The error
   */
  static memory(kind: SpecJob["kind"], mb: number, cause: unknown): SpecWorkLimitError {
    return new SpecWorkLimitError(
      `Studio stopped ${WORK[kind]}: it needs more than the ${mb} MB of memory Studio gives one.`,
      cause,
    );
  }

  /**
   * The job's specification could not be handed to the process that does
   * the work: Node copies a value nested only some thousands of levels
   * deep, though JSON parses one far deeper.
   *
   * @param kind - The job
   * @param cause - What copying it failed with
   * @returns The error
   */
  static unsendable(kind: SpecJob["kind"], cause: unknown): SpecWorkLimitError {
    return new SpecWorkLimitError(
      `Studio did not start ${WORK[kind]}: the specification is nested too deeply, or is too large, to hand to the process that does the work.`,
      cause,
    );
  }

  private constructor(message: string, cause?: unknown) {
    super(message, { code: "SPEC_WORK_LIMIT", cause });
  }
}
