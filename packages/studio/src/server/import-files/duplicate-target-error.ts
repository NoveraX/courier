import { CourierError } from "@noverax/courier";

/**
 * Two parts of what an operation generates would be written to one file,
 * and either would overwrite the other — as two groups of one name in a
 * specification do. Nothing is written. Answered 400: the specification
 * needs its groups named apart.
 *
 * @example
 * ```ts
 * throw new DuplicateTargetError("src/api/pets/pets/index.ts");
 * ```
 */
export class DuplicateTargetError extends CourierError<"DUPLICATE_TARGET"> {
  /** The status a route answers with. */
  readonly httpStatus = 400;

  /**
   * @param path - The file generated twice, project-relative
   */
  constructor(path: string) {
    super(
      `Two parts of the specification generate ${path}, so either would overwrite the other; name its groups apart.`,
      { code: "DUPLICATE_TARGET", context: { path } },
    );
  }
}
