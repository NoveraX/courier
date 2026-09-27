import { CourierError } from "@noverax/courier";

/**
 * Adding endpoints computed two versions of one file, and writing either
 * would drop what the other added. Nothing is written; this is Studio's
 * own failure, answered 500.
 *
 * @example
 * ```ts
 * throw new ManagePlanConflictError("src/api/pets/source.ts");
 * ```
 */
export class ManagePlanConflictError extends CourierError<"MANAGE_PLAN_CONFLICT"> {
  /**
   * @param path - The file computed twice, project-relative
   */
  constructor(path: string) {
    super(`Adding the endpoints changes ${path} in two ways at once; nothing was written.`, {
      code: "MANAGE_PLAN_CONFLICT",
      context: { path },
    });
  }
}
