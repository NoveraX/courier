import { CourierError } from "@noverax/courier";

/**
 * A text Studio was asked to read is no specification it reads: not one of
 * its formats, YAML or JSON that does not parse, a document of another
 * shape. The message says why, as the parser put it. Answered 400.
 *
 * @example
 * ```ts
 * throw new SpecTextError("Map keys must be unique at line 4, column 3");
 * ```
 */
export class SpecTextError extends CourierError<"SPEC_NOT_READABLE"> {
  /** The status a route answers with. */
  readonly httpStatus = 400;

  /**
   * @param message - Why the text is not a specification Studio reads
   */
  constructor(message: string) {
    super(message, { code: "SPEC_NOT_READABLE" });
  }
}
