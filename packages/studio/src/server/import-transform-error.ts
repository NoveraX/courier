import { CourierError } from "@noverax/courier";

/**
 * An import's `transform` threw, or returned something that is not a
 * specification or one Studio does not generate from. Nothing is
 * generated. Answered 400: the transform in courier.config is what needs
 * fixing.
 *
 * @example
 * ```ts
 * throw new ImportTransformError("petstore", "threw: no such tag", error);
 * ```
 */
export class ImportTransformError extends CourierError<"IMPORT_TRANSFORM_FAILED"> {
  /** The status a route answers with. */
  readonly httpStatus = 400;

  /**
   * @param importName - The import's key under `imports`
   * @param problem - What went wrong, such as `threw: no such tag`
   * @param cause - What the transform threw, if it threw
   */
  constructor(importName: string, problem: string, cause?: unknown) {
    super(`The transform of the import "${importName}" in courier.config ${problem}.`, {
      code: "IMPORT_TRANSFORM_FAILED",
      cause,
      context: { importName },
    });
  }
}
