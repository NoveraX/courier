import { CourierError } from "@noverax/courier";

/** The part of an import's declaration that Studio refused. */
export type InvalidImportField =
  | "outputDir"
  | "sourceName"
  | "importName"
  | "group"
  | "generateClient";

/**
 * An import declaration Studio will not generate into: an output directory
 * outside the project or inside `.git`, `node_modules` or `.courier`, a
 * name that gives no usable identifier, a group name that is not one, or a
 * proxy caller in a project that keeps no routes module. Answered 400.
 *
 * @example
 * ```ts
 * throw new InvalidImportError("outputDir", "../lib", "it leaves the project");
 * ```
 */
export class InvalidImportError extends CourierError<"INVALID_IMPORT"> {
  /** The status a route answers with. */
  readonly httpStatus = 400;
  /** The field that was refused. */
  readonly field: InvalidImportField;

  /**
   * @param field - The field that was refused
   * @param value - Its value as declared
   * @param reason - Why, completing "`<field>` <value> is refused: "
   */
  constructor(field: InvalidImportField, value: string, reason: string) {
    super(`The import's ${field} ${JSON.stringify(value)} is refused: ${reason}.`, {
      code: "INVALID_IMPORT",
      context: { field, value },
    });
    this.field = field;
  }
}
