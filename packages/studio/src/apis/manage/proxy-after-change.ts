import { applyImportDefaults, type GeneratedFile, type GenerateOptions } from "../generator";
import { assertGeneratable } from "../generator/generatable-spec";
import { generateProxyFile } from "../generator/generate-proxy";
import type { ImportLayout } from "../layout";
import type { ParsedSpec } from "../parser/types";

/**
 * The import's proxy caller as the generator writes it now, for a change to
 * the import's endpoints. It takes its routes from the routes module, so it
 * reads the same whichever endpoints the import holds; a caller an earlier
 * release wrote in another form is written again in this one. The
 * specification is held to what the generator writes as code first, as
 * every file generated from one is.
 *
 * @param spec - The specification the import is generated from
 * @param options - The import's generation options
 * @param layout - Where the import's files are
 * @returns The module, or `null` when the import has no proxy caller
 * @throws {InvalidSpecError} When a value the spec gives that would be written as code is refused
 * @example
 * ```ts
 * proxyAfterChange(spec, options, layout)?.content;
 * ```
 */
export function proxyAfterChange(
  spec: ParsedSpec,
  options: GenerateOptions,
  layout: ImportLayout,
): GeneratedFile | null {
  assertGeneratable(spec);
  return generateProxyFile(spec, applyImportDefaults(options, layout));
}
