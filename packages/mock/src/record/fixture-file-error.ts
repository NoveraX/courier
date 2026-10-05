import { CourierError } from "@noverax/courier";

/**
 * A mock's recordings file that is not a HAR log of Courier recordings. The
 * mock does not start on it: answering from a file it cannot read would
 * record every call again over it.
 *
 * @example
 * ```ts
 * throw new FixtureFileError("/app/fixtures/shop.har");
 * ```
 */
export class FixtureFileError extends CourierError<"FIXTURES_UNREADABLE"> {
  /** The file's absolute path. */
  readonly file: string;

  /**
   * @param file - The file's absolute path
   * @param options - What reading it threw, when it threw
   */
  constructor(file: string, options: { cause?: unknown } = {}) {
    super(
      `[courier-mock] ${file} is not a HAR log of Courier recordings. Fix it, or delete it to record the answers again.`,
      { code: "FIXTURES_UNREADABLE", cause: options.cause, context: { file } },
    );
    this.file = file;
  }
}
