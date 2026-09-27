import { groupLocalName } from "../generator";
import type { GenerateOptions } from "../generator/types";
import type { ImportLayout } from "../layout";
import type { AddResult } from "./types";
import { addGroupsToSourceFile } from "./update-source-file";

/**
 * The import's `source.ts` with the groups being added whose files are not
 * on disk yet, each imported from its own folder and listed among the
 * groups. A flat import has no group files: its source takes the endpoints
 * themselves.
 *
 * @param endpointsToAdd - The endpoints to add, by group, as the import's files name them
 * @param options - The import's generation options, of which `groupBy` is read
 * @param existingFiles - The import's files as they are, by path
 * @param layout - Where the import's files are
 * @returns The source's update, or `undefined` when no group is new or there is no source
 * @example
 * ```ts
 * sourceWithNewGroups({ store: ["listOrders"] }, options, files, layout)?.content;
 * ```
 */
export function sourceWithNewGroups(
  endpointsToAdd: Record<string, string[]>,
  options: Pick<GenerateOptions, "groupBy">,
  existingFiles: Record<string, string>,
  layout: ImportLayout,
): AddResult["sourceFileUpdate"] {
  if (options.groupBy === "single") return undefined;
  const source = existingFiles[layout.sourceFile];
  const added = Object.keys(endpointsToAdd).filter(
    (group) => !Object.hasOwn(existingFiles, layout.groupFile(group)),
  );
  if (added.length === 0 || !source) return undefined;
  const content = addGroupsToSourceFile(
    layout.sourceFile,
    source,
    added.map((name) => ({
      name,
      local: groupLocalName(name, layout.sourceBinding),
      importPath: layout.groupSpecifier(name, "index"),
    })),
  );
  return { path: layout.sourceFile, content };
}
