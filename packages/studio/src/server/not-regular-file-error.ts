import { CourierError } from "@noverax/courier";

/**
 * A path Studio reads as a file is a symbolic link, a directory, a FIFO or
 * anything else that is not a regular file.
 *
 * @example
 * ```ts
 * throw new NotRegularFileError(path, "a symbolic link");
 * ```
 */
export class NotRegularFileError extends CourierError<"NOT_REGULAR_FILE"> {
  /** The path that was read. */
  readonly path: string;

  /**
   * @param path - The path that was read
   * @param found - What is there instead, such as `a symbolic link`
   * @param options - The error that told Studio so, if any
   */
  constructor(path: string, found: string, options: { cause?: unknown } = {}) {
    super(`${path} is ${found}, not a regular file.`, {
      code: "NOT_REGULAR_FILE",
      cause: options.cause,
      context: { path },
    });
    this.path = path;
  }
}
