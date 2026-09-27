import { CourierError } from "@noverax/courier";

/**
 * `.courier/`, or a folder Studio keeps in it, is a symbolic link or not a
 * folder: what Studio writes there would land wherever it points, and what
 * it reads there could name files anywhere. Nothing is written. Answered
 * 409: the link needs replacing with a folder, or removing.
 *
 * @example
 * ```ts
 * throw new CourierDirUnsafeError(".courier/journal");
 * ```
 */
export class CourierDirUnsafeError extends CourierError<"COURIER_DIR_UNSAFE"> {
  /** The status a route answers with. */
  readonly httpStatus = 409;

  /**
   * @param dir - The folder, project-relative
   */
  constructor(dir: string) {
    super(
      `${dir} is a symbolic link or not a folder, so Studio keeps nothing there. Replace it with a folder, or remove it.`,
      { code: "COURIER_DIR_UNSAFE", context: { dir } },
    );
  }
}
