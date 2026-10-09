/**
 * The person stopped the command at one of its questions — with Ctrl+C, or
 * by closing its input with Ctrl+D — which it asks before it changes
 * anything.
 *
 * @example
 * ```ts
 * if (error instanceof CancelledError) process.exitCode = error.status;
 * ```
 */
export class CancelledError extends Error {
  /** The exit status: 130 after Ctrl+C, as a shell gives a command it interrupts, and 1 when the input closed. */
  readonly status: number;

  /**
   * @param interrupted - Whether Ctrl+C stopped it, rather than the input closing
   */
  constructor(interrupted: boolean) {
    super("Cancelled: nothing was changed");
    this.name = "CancelledError";
    this.status = interrupted ? 130 : 1;
  }
}
