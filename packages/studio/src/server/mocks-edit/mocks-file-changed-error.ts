import { CourierError } from "@noverax/courier";

/**
 * The mocks file is no longer the one Studio planned its edit against:
 * something else wrote, created or removed it in between, or put a link or
 * something other than a file at its name. Studio leaves it as it found it.
 *
 * @example
 * ```ts
 * if (hashFile(path) !== expectedHash) throw new MocksFileChangedError(path);
 * ```
 */
export class MocksFileChangedError extends CourierError<"MOCKS_FILE_CHANGED"> {
  /** The file that changed. */
  readonly path: string;

  constructor(path: string, options: { cause?: unknown } = {}) {
    super(`${path} changed on disk while Studio was editing it, so Studio left it as it is.`, {
      code: "MOCKS_FILE_CHANGED",
      cause: options.cause,
    });
    this.path = path;
  }
}
