import { CourierError } from "@noverax/courier";

/** Why a read of the project Studio runs was refused. */
export type ProjectStateErrorCode = "FRESH_INSIDE_EDIT";

/**
 * A read of the project Studio runs that was refused, and why.
 *
 * `FRESH_INSIDE_EDIT`: an edit on the reload chain asked to catch up with the
 * disk, which would wait for the chain the edit itself holds. An edit reads
 * what its context lends instead.
 *
 * @example
 * ```ts
 * if (err instanceof ProjectStateError && err.code === "FRESH_INSIDE_EDIT") log.error(err.message);
 * ```
 */
export class ProjectStateError extends CourierError<ProjectStateErrorCode> {
  /**
   * @param code - Why the read was refused
   * @param message - What was refused, and what to read instead
   */
  constructor(code: ProjectStateErrorCode, message: string) {
    super(message, { code });
  }
}
