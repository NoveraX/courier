import { CourierError } from "@noverax/courier";

import { SPEC_THREAD_PROTOCOL } from "./spec-thread-protocol";

/** Why a thread did not do its job, through no fault of the job's own. */
export type StudioThreadErrorCode = "STUDIO_THREAD_OUTDATED" | "STUDIO_THREAD_FAILED";

const REBUILD =
  "Build Studio again — `npx tsdown` in packages/studio — or install it again, then restart it.";

/**
 * A thread Studio started for a job failed for a reason of Studio's own:
 * its thread script is from another build of Studio, or missing, or the
 * thread failed some other way. Not the request's fault, so a route logs
 * it and answers 500.
 *
 * @example
 * ```ts
 * if (ready.protocol !== SPEC_THREAD_PROTOCOL) throw StudioThreadError.outdated(ready.protocol);
 * ```
 */
export class StudioThreadError extends CourierError<StudioThreadErrorCode> {
  /**
   * The thread script greeted Studio with another version of what they say to each other.
   *
   * @param protocol - The version it named
   * @returns The error
   */
  static outdated(protocol: number): StudioThreadError {
    return new StudioThreadError(
      "STUDIO_THREAD_OUTDATED",
      `Studio's thread script is from another build of Studio: it speaks version ${protocol} of what Studio says to it, not ${SPEC_THREAD_PROTOCOL}. ${REBUILD}`,
    );
  }

  /**
   * The thread script did not greet Studio in time, as one built before it greeted does not.
   *
   * @param ms - How long Studio waited
   * @returns The error
   */
  static silent(ms: number): StudioThreadError {
    return new StudioThreadError(
      "STUDIO_THREAD_OUTDATED",
      `Studio's thread script did not say it was ready within ${ms / 1000} s: it is from another build of Studio, or it could not start. ${REBUILD}`,
    );
  }

  /**
   * The thread script is not where Studio looks for it.
   *
   * @param cause - What starting the thread failed with
   * @returns The error
   */
  static missing(cause: unknown): StudioThreadError {
    return new StudioThreadError(
      "STUDIO_THREAD_OUTDATED",
      `Studio's thread script is missing. ${REBUILD}`,
      cause,
    );
  }

  /**
   * The thread failed some other way.
   *
   * @param cause - What it failed with
   * @returns The error
   */
  static failed(cause: Error): StudioThreadError {
    return new StudioThreadError(
      "STUDIO_THREAD_FAILED",
      `Studio's thread for the job failed: ${cause.message}`,
      cause,
    );
  }

  private constructor(code: StudioThreadErrorCode, message: string, cause?: unknown) {
    super(message, { code, cause });
  }
}
