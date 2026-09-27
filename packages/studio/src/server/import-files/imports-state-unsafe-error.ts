import { CourierError } from "@noverax/courier";

/**
 * Studio will not save the imports state over a file it could neither read
 * nor keep a copy of: that would erase the record of which files every
 * import owns. Nor does it begin writing an import's files while the state
 * is not read whole, since then it could not tell, after a crash, whether
 * that write finished. Answered 409: the file is fixed, moved aside or
 * deleted first.
 *
 * @example
 * ```ts
 * throw new ImportsStateUnsafeError(".courier/imports-state.json", "unread");
 * ```
 */
export class ImportsStateUnsafeError extends CourierError<"IMPORTS_STATE_UNSAFE"> {
  /** The status a route answers with. */
  readonly httpStatus = 409;

  /**
   * @param file - The imports state file, project-relative
   * @param why - `unsafe` when saving would lose content Studio cannot keep; `unread` when it holds content Studio cannot read
   */
  constructor(file: string, why: "unsafe" | "unread" = "unsafe") {
    super(
      why === "unsafe"
        ? `Studio cannot read ${file}, or keep a copy of it, so saving would erase which files each import owns. Nothing was changed; fix the file's permissions, or move it aside, and try again.`
        : `Studio cannot read all of ${file}, so it could not tell after a crash whether this write finished. Nothing was changed; fix the file — a merge may have left conflict markers in it — or delete it to start over, and try again.`,
      { code: "IMPORTS_STATE_UNSAFE", context: { file, why } },
    );
  }
}
