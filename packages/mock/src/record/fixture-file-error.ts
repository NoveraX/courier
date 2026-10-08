import { CourierError } from "@noverax/courier";

/**
 * A mock's recordings file that is not a HAR log of Courier recordings. The
 * mock does not start on it: answering from a file it cannot read would
 * record every call again over it. Reading recordings for a test, a file
 * that does not exist is one too.
 *
 * @example
 * ```ts
 * throw new FixtureFileError("/app/fixtures/shop.har");
 * ```
 */
export class FixtureFileError extends CourierError<"FIXTURES_UNREADABLE" | "FIXTURES_MISSING"> {
  /** The file's absolute path. */
  readonly file: string;

  /**
   * @param file - The file's absolute path
   * @param options - What reading it threw, when it threw; whether there is no such file
   */
  constructor(file: string, options: { cause?: unknown; missing?: boolean } = {}) {
    super(
      options.missing
        ? `[courier-mock] ${file} does not exist, so it holds no recordings to read.`
        : `[courier-mock] ${file} is not a HAR log of Courier recordings. Fix it, or delete it to record the answers again.`,
      {
        code: options.missing ? "FIXTURES_MISSING" : "FIXTURES_UNREADABLE",
        cause: options.cause,
        context: { file },
      },
    );
    this.file = file;
  }
}
