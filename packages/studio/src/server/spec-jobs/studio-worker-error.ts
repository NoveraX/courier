import { CourierError } from "@noverax/courier";

import { SPEC_JOB_PROTOCOL } from "./spec-job-protocol";

/** Why a worker process did not do its job, through no fault of the job's own. */
export type StudioWorkerErrorCode = "STUDIO_WORKER_OUTDATED" | "STUDIO_WORKER_FAILED";

const REBUILD =
  "Build Studio again — `npx tsdown` in packages/studio — or install it again, then restart it.";

/**
 * A process Studio started for a job failed for a reason of Studio's own:
 * its worker script is from another build of Studio, or missing, or the
 * process failed some other way. Not the request's fault, so a route logs
 * it and answers 500.
 *
 * @example
 * ```ts
 * if (ready.protocol !== SPEC_JOB_PROTOCOL) throw StudioWorkerError.outdated(ready.protocol);
 * ```
 */
export class StudioWorkerError extends CourierError<StudioWorkerErrorCode> {
  /**
   * The worker script greeted Studio with another version of what they say to each other.
   *
   * @param protocol - The version it named
   * @returns The error
   */
  static outdated(protocol: number): StudioWorkerError {
    return new StudioWorkerError(
      "STUDIO_WORKER_OUTDATED",
      `Studio's worker script is from another build of Studio: it speaks version ${protocol} of what Studio says to it, not ${SPEC_JOB_PROTOCOL}. ${REBUILD}`,
    );
  }

  /**
   * The worker script did not greet Studio in time, as one built before it greeted does not.
   *
   * @param ms - How long Studio waited
   * @returns The error
   */
  static silent(ms: number): StudioWorkerError {
    return new StudioWorkerError(
      "STUDIO_WORKER_OUTDATED",
      `Studio's worker script did not say it was ready within ${ms / 1000} s: it is from another build of Studio, or it could not start. ${REBUILD}`,
    );
  }

  /**
   * The worker script is not where Studio looks for it. The message names no
   * path of this machine; the cause, which Studio logs, does.
   *
   * @param script - Where Studio looked
   * @returns The error
   */
  static missing(script: string): StudioWorkerError {
    return new StudioWorkerError(
      "STUDIO_WORKER_OUTDATED",
      `Studio's worker script is missing. ${REBUILD}`,
      new Error(`No worker script at ${script}`),
    );
  }

  /**
   * The process failed some other way.
   *
   * @param cause - What it failed with
   * @returns The error
   */
  static failed(cause: Error): StudioWorkerError {
    return new StudioWorkerError(
      "STUDIO_WORKER_FAILED",
      `Studio's process for the job failed: ${cause.message}`,
      cause,
    );
  }

  private constructor(code: StudioWorkerErrorCode, message: string, cause?: unknown) {
    super(message, { code, cause });
  }
}
