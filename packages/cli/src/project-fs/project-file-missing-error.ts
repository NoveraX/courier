import { CourierError } from "@noverax/courier";

/**
 * A file a request names is not in the project. Answered 400.
 *
 * @example
 * ```ts
 * throw new ProjectFileMissingError("specs/pets.yaml");
 * ```
 */
export class ProjectFileMissingError extends CourierError<"FILE_NOT_FOUND"> {
  /** The status a route answers with. */
  readonly httpStatus = 400;

  /**
   * @param path - The file, as the request named it
   */
  constructor(path: string) {
    super(`There is no file ${path} in the project.`, {
      code: "FILE_NOT_FOUND",
      context: { path },
    });
  }
}
