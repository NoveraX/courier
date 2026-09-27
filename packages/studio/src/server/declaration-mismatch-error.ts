import { CourierError } from "@noverax/courier";

/**
 * A write for an import names another directory than the one courier.config
 * declares for it. Writing there while cleaning the declared directory
 * would delete files the write never touched, so nothing is written.
 * Answered 409: the declaration or the request has to change first.
 *
 * @example
 * ```ts
 * throw new DeclarationMismatchError("pets", "lib/gen/shop", "src/api/pets");
 * ```
 */
export class DeclarationMismatchError extends CourierError<"DECLARATION_MISMATCH"> {
  /** The status a route answers with. */
  readonly httpStatus = 409;

  /**
   * @param importName - The import's key under `imports`
   * @param declared - The directory courier.config gives the import
   * @param requested - The directory the request's options give it
   */
  constructor(importName: string, declared: string, requested: string) {
    super(
      `courier.config declares the import "${importName}" in ${declared}, but this write asks for ${requested}. Generate it with the declared options, or change the declaration first.`,
      { code: "DECLARATION_MISMATCH", context: { importName, declared, requested } },
    );
  }
}
