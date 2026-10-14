import { importsCarryExtensions, parseSource } from "@noverax/courier-cli/devkit";
import { groupLocalName } from "../generator";
import type { GenerateOptions } from "../generator/types";
import type { ImportLayout } from "../layout";
import { addGroupsToSourceFile } from "./update-source-file";

/**
 * The import's `source.ts` with the new groups that sit in no other group,
 * each imported from its own folder and listed among the groups. A flat
 * import has no group files: its source takes the endpoints themselves.
 *
 * @param added - The new groups a source lists, by name: none inside another group
 * @param options - The import's generation options, of which `groupBy` is read
 * @param existingFiles - The import's files as they are, by path
 * @param layout - Where the import's files are
 * @returns The source's update, or `undefined` when no group is new or there is no source
 * @example
 * ```ts
 * sourceWithNewGroups(["store"], options, files, layout)?.content;
 * ```
 */
export function sourceWithNewGroups(
  added: readonly string[],
  options: Pick<GenerateOptions, "groupBy">,
  existingFiles: Record<string, string>,
  layout: ImportLayout,
): { path: string; content: string } | undefined {
  if (options.groupBy === "single") return undefined;
  const source = existingFiles[layout.sourceFile];
  if (added.length === 0 || !source) return undefined;
  /* A new group is imported as the source imports the others. */
  const parsed = parseSource(layout.sourceFile, source);
  const extension = parsed.problem === null && importsCarryExtensions(parsed.program) ? ".js" : "";
  const content = addGroupsToSourceFile(
    layout.sourceFile,
    source,
    added.map((name) => ({
      name,
      local: groupLocalName(name, layout.sourceBinding),
      importPath: `${layout.groupSpecifier(name, "index")}${extension}`,
    })),
  );
  return { path: layout.sourceFile, content };
}
