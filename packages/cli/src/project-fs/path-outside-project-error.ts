import { CourierError } from "@noverax/courier";

/**
 * A path Courier was asked to read or write lies outside the project, is
 * absolute, names a drive or a network share, or reaches outside through a
 * symbolic link. Studio answers it 400: the request is what is wrong.
 *
 * @example
 * ```ts
 * throw new PathOutsideProjectError("../secrets.ts", "it leaves the project");
 * ```
 */
export class PathOutsideProjectError extends CourierError<"PATH_OUTSIDE_PROJECT"> {
  /** The status a route answers with. */
  readonly httpStatus = 400;
  /** The path as it was given. */
  readonly path: string;

  /**
   * @param path - The path as it was given
   * @param reason - Why it is refused, completing "Courier refused <path>: "
   */
  constructor(path: string, reason: string) {
    super(`Courier refused ${JSON.stringify(path)}: ${reason}.`, {
      code: "PATH_OUTSIDE_PROJECT",
      context: { path },
    });
    this.path = path;
  }
}
