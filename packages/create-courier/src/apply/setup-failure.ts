/** Why a setup stopped once it had begun to change the project. */
export type FailureCode =
  /** The install of the setup's packages failed. */
  | "INSTALL_FAILED"
  /** The install ran past its time and was stopped. */
  | "INSTALL_TIMED_OUT"
  /** The person stopped the run with Ctrl+C. */
  | "CANCELLED"
  /** A file the plan creates was there by the time it was written. */
  | "FILE_APPEARED"
  /** A file the plan changes was changed since the plan was made. */
  | "FILE_CHANGED"
  /** A file could not be written: the disk is full, or the folder is not the person's to write. */
  | "WRITE_FAILED"
  /** A path the plan writes leads out of the project, through a link. */
  | "PATH_OUTSIDE_PROJECT"
  /** Studio's import of the specification failed. */
  | "IMPORT_FAILED"
  /** Something the run did not expect went wrong: its error says what, with its stack. */
  | "UNEXPECTED_ERROR";

/**
 * A setup stopped part way, for a reason it names: what it did is undone,
 * and the run says what it could not undo.
 *
 * @example
 * ```ts
 * throw new SetupFailure("FILE_CHANGED", "vite.config.ts changed while the plan was shown");
 * ```
 */
export class SetupFailure extends Error {
  readonly code: FailureCode;

  /**
   * @param code - Why it stopped
   * @param message - What stopped it, in a sentence without its full stop
   * @param options - The error that caused it, if any
   */
  constructor(code: FailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SetupFailure";
    this.code = code;
  }
}
