import { type GeneratedFile, type GenerateOptions, generateCode } from "../generator";
import type { ImportLayout } from "../layout";
import type { ParsedSpec } from "../parser/types";
import { listedSelection } from "./listed-selection";

/**
 * The code generated for endpoints to add to an import: the import's files
 * with those endpoints alone, which adding them merges into the files on
 * disk. Picked as the import's files name the endpoints; the generator
 * selects them as the specification names them.
 *
 * @param spec - The specification the import is generated from
 * @param endpointsToAdd - The endpoints to add, by group, as the import's files name them
 * @param options - The import's generation options; its selection is replaced
 * @param layout - Where the import's files go
 * @returns The generated files
 * @example
 * ```ts
 * const generated = addedEndpointsCode(spec, { pets: ["getPet"] }, options, layout);
 * ```
 */
export function addedEndpointsCode(
  spec: ParsedSpec,
  endpointsToAdd: Record<string, string[]>,
  options: GenerateOptions,
  layout: ImportLayout,
): GeneratedFile[] {
  const { selection } = listedSelection(spec, options.groupBy ?? "tag", endpointsToAdd);
  return generateCode(spec, { ...options, selectedEndpoints: selection }, layout.importName);
}
