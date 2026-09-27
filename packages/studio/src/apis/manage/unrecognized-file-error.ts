import { CourierError } from "@noverax/courier";

/**
 * Studio cannot find, in a file it would add endpoints to, the declaration
 * holding them: the file was reshaped by hand. Nothing is written. Answered
 * 409: the endpoints are added by hand, or the import is written again.
 *
 * @example
 * ```ts
 * throw new UnrecognizedFileError("src/api/pets/pets/index.ts");
 * ```
 */
export class UnrecognizedFileError extends CourierError<"FILE_NOT_RECOGNIZED"> {
  /** The status a route answers with. */
  readonly httpStatus = 409;

  /**
   * @param path - The file, project-relative
   */
  constructor(path: string) {
    super(
      `Studio cannot find the endpoints in ${path} to add to. Add the endpoints there by hand, or write the import again.`,
      { code: "FILE_NOT_RECOGNIZED", context: { path } },
    );
  }
}
