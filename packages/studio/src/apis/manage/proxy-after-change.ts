import { applyImportDefaults, type GeneratedFile, type GenerateOptions } from "../generator";
import { generateProxyFile } from "../generator/generate-proxy";
import { selectedEndpoints, transformSpec } from "../generator/transform-spec";
import type { ImportLayout } from "../layout";
import type { ParsedSpec } from "../parser/types";
import { diskListing } from "./disk-listing";
import { listedSelection } from "./listed-selection";
import type { RemoveResult } from "./types";

/**
 * The import's files once a removal is applied to them.
 *
 * @param before - The import's files before the removal, by path
 * @param removed - What the removal changes, if there is one
 * @returns The files after it, by path
 */
export function filesAfter(
  before: Readonly<Record<string, string>>,
  removed: RemoveResult | undefined,
): Record<string, string> {
  if (removed === undefined) return { ...before };
  const gone = new Set(removed.deletedFiles);
  const after = Object.fromEntries(Object.entries(before).filter(([path]) => !gone.has(path)));
  for (const file of removed.modifiedFiles) after[file.path] = file.content;
  if (removed.indexFileUpdate)
    after[removed.indexFileUpdate.path] = removed.indexFileUpdate.content;
  return after;
}

/**
 * The import's proxy caller as its endpoints stand after a change. An API
 * with streams gives its caller a boundary listing every endpoint, so
 * adding or removing one changes the module: it is written again from the
 * specification, for the endpoints the import's files hold that it
 * describes.
 *
 * @param spec - The specification the import is generated from
 * @param options - The import's generation options
 * @param layout - Where the import's files are
 * @param files - The import's files as the change leaves them, by path
 * @returns The module, or `null` when the import has no proxy caller
 * @example
 * ```ts
 * proxyAfterChange(spec, options, layout, filesAfter(afterAdd, removeResult))?.content;
 * ```
 */
export function proxyAfterChange(
  spec: ParsedSpec,
  options: GenerateOptions,
  layout: ImportLayout,
  files: Readonly<Record<string, string>>,
): GeneratedFile | null {
  if (options.generateClient !== "proxy" && options.generateClient !== "both") return null;
  const picks = Object.fromEntries(
    diskListing(layout, files).map((group) => [group.name, group.endpoints]),
  );
  const { selection } = listedSelection(spec, options.groupBy ?? "tag", picks);
  const resolved = applyImportDefaults({ ...options, selectedEndpoints: selection }, layout);
  const generated = transformSpec(spec, resolved, selectedEndpoints(spec.groups, selection));
  return generateProxyFile(generated, resolved);
}
