import { CourierError } from "@noverax/courier";

/**
 * An import's files would go into a directory another import owns, or one
 * holding or held by it: each would take the other's files for its own.
 * Nothing is written. Answered 409: one of the imports needs another name
 * or output directory.
 *
 * @example
 * ```ts
 * throw new DirOverlapError("petStore", "src/api/pet-store", "store", "src/api/pet-store");
 * ```
 */
export class DirOverlapError extends CourierError<"DIR_OVERLAP"> {
  /** The status a route answers with. */
  readonly httpStatus = 409;

  /**
   * @param name - The import being written
   * @param dir - Its directory, project-relative
   * @param other - The import already there
   * @param otherDir - That import's directory, project-relative
   */
  constructor(name: string, dir: string, other: string, otherDir: string) {
    super(
      `The import "${name}" would write into ${dir}, which overlaps ${otherDir} of the import "${other}". Give one of them another name or output directory.`,
      { code: "DIR_OVERLAP", context: { name, dir, other, otherDir } },
    );
  }
}
