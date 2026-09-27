import { CourierError } from "@noverax/courier";

/**
 * Studio will not save the imports state over a file it could neither read
 * nor keep a copy of: that would erase the record of which files every
 * import owns. The apply that wanted to save is undone. Answered 409: the
 * file needs its permissions fixed, or moving aside, first.
 *
 * @example
 * ```ts
 * throw new ImportsStateUnsafeError(".courier/imports-state.json");
 * ```
 */
export class ImportsStateUnsafeError extends CourierError<"IMPORTS_STATE_UNSAFE"> {
  /** The status a route answers with. */
  readonly httpStatus = 409;

  /**
   * @param file - The imports state file, project-relative
   */
  constructor(file: string) {
    super(
      `Studio cannot read ${file}, or keep a copy of it, so saving would erase which files each import owns. Nothing was changed; fix the file's permissions, or move it aside, and try again.`,
      { code: "IMPORTS_STATE_UNSAFE", context: { file } },
    );
  }
}
