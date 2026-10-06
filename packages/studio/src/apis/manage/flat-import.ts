/**
 * Tell whether an import is generated flat: its endpoints live in its
 * `source.ts`, with no group files.
 *
 * @param options - The import's generation options
 * @returns Whether it is flat
 */
export function isFlatImport(options: { groupBy?: string | undefined }): boolean {
  return options.groupBy === "single";
}
