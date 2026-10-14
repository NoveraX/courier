import { parseSource } from "@noverax/courier-cli/devkit";
import { propertyKeyName } from "../../server/mocks-edit/plan/property-key-name";
import type { ImportLayout } from "../layout";
import { findGroupDeclaration } from "./group-declaration";
import { collectGroupDeletions } from "./remove-helpers";
import { groupsObject, removeGroupsFromGroupFile } from "./update-group-file";

/** The removal's changes so far, changed in place. */
interface Removal {
  readonly modifiedFiles: Array<{ path: string; content: string }>;
  readonly deletedFiles: string[];
}

/**
 * Take the groups removed whole out of the groups they sit in: a group file
 * listing one loses its entry and the import, and a group left with neither
 * endpoints nor groups inside goes too — and so on up to the source.
 *
 * @param deleted - The groups removed whole, by name
 * @param existingFiles - The import's files as they are, by path
 * @param layout - Where the import's files are
 * @param removal - The changes planned so far; the parents' files are changed in it
 * @returns Every group removed whole, those that went for being left empty included
 * @example
 * ```ts
 * withoutInnerGroups(["lines"], files, layout, { modifiedFiles, deletedFiles }); // → ["lines"]
 * ```
 */
export function withoutInnerGroups(
  deleted: readonly string[],
  existingFiles: Record<string, string>,
  layout: ImportLayout,
  removal: Removal,
): string[] {
  const gone = [...deleted];
  for (let next = 0; next < gone.length; next++) {
    const name = gone[next] ?? "";
    for (const path of groupFiles(existingFiles, layout)) {
      if (removal.deletedFiles.includes(path)) continue;
      const current = currentContent(path, existingFiles, removal);
      if (!innerNames(path, current).includes(name)) continue;
      const content = removeGroupsFromGroupFile(path, current, [name]);
      const emptied = emptyGroup(path, content);
      const planned = removal.modifiedFiles.findIndex((file) => file.path === path);
      if (planned !== -1) removal.modifiedFiles.splice(planned, 1);
      if (emptied === null) {
        removal.modifiedFiles.push({ path, content });
        continue;
      }
      collectGroupDeletions(layout, emptied, existingFiles, removal.deletedFiles);
      gone.push(emptied);
    }
  }
  return gone;
}

/* The import's group files: each folder's `index.ts`, the barrel left out. */
function groupFiles(existingFiles: Record<string, string>, layout: ImportLayout): string[] {
  return Object.keys(existingFiles).filter(
    (path) =>
      path.startsWith(`${layout.dir}/`) && path.endsWith("/index.ts") && path !== layout.indexFile,
  );
}

function currentContent(
  path: string,
  existingFiles: Record<string, string>,
  removal: Removal,
): string {
  return (
    removal.modifiedFiles.find((file) => file.path === path)?.content ?? existingFiles[path] ?? ""
  );
}

/* The groups a file's group holds inside it, by name. */
function innerNames(path: string, content: string): string[] {
  const parsed = parseSource(path, content);
  const declaration = parsed.problem === null ? findGroupDeclaration(parsed.program) : null;
  const groups = declaration ? groupsObject(declaration.config) : null;
  return (groups?.properties ?? []).flatMap((p) =>
    p.type === "Property" && !p.computed ? [propertyKeyName(p.key) ?? ""] : [],
  );
}

/* The group a file declares, when it holds neither endpoints nor groups any more. */
function emptyGroup(path: string, content: string): string | null {
  const parsed = parseSource(path, content);
  const declaration = parsed.problem === null ? findGroupDeclaration(parsed.program) : null;
  if (declaration === null || declaration.name === null) return null;
  const inner = groupsObject(declaration.config)?.properties.length ?? 0;
  return declaration.endpoints.properties.length === 0 && inner === 0 ? declaration.name : null;
}
