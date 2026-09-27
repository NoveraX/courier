import { CourierError } from "@noverax/courier";

/**
 * `sources` declares another API under the name an import would take. Studio
 * matches an import to the source of its name, so writing the import would
 * make Studio treat that API as the import's; nothing is written. Answered
 * 409: the import needs another name, or the config another source name.
 *
 * @example
 * ```ts
 * throw new NameTakenError("billing", "src/gen/billing/source.ts");
 * ```
 */
export class NameTakenError extends CourierError<"NAME_TAKEN"> {
  /** The status a route answers with. */
  readonly httpStatus = 409;

  /**
   * @param name - The import's name
   * @param sourceFile - The source the import would generate, project-relative
   */
  constructor(name: string, sourceFile: string) {
    super(
      `courier.config names another API "${name}" under sources, so Studio will not write an import of that name. Give the import another name, or rename that source.`,
      { code: "NAME_TAKEN", context: { name, sourceFile } },
    );
  }
}
