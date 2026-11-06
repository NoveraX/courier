/**
 * A run that changed nothing, for a reason a program can tell apart by
 * its code: what it was asked for cannot be done here — a release no
 * registry has, a command older than the release it is asked to move
 * to. Its message is worded for the person.
 *
 * @example
 * ```ts
 * throw new SetupRefusal("CLI_TOO_OLD", "courier-cli 0.4.0 knows the changes up to 0.4");
 * ```
 */
export class SetupRefusal extends Error {
  readonly code: string;

  /**
   * @param code - Why, as a program reads it, in capitals: `CLI_TOO_OLD`
   * @param message - Why, as the person reads it, without its full stop
   */
  constructor(code: string, message: string) {
    super(message);
    this.name = "SetupRefusal";
    this.code = code;
  }
}
