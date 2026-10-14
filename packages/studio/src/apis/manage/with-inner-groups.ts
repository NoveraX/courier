import { importsCarryExtensions, parseSource } from "@noverax/courier-cli/devkit";
import type { ImportLayout } from "../layout";
import type { NewGroup } from "./new-groups";
import type { FileChange } from "./types";
import { addGroupsToGroupFile } from "./update-group-file";

/**
 * List each new group inside the group it is generated in, where that
 * group's file is on disk already: the file — as the changes already
 * planned leave it — gains the group's import and its entry in `groups`.
 * A new group inside another new one needs nothing: its parent's file is
 * generated with it.
 *
 * @param files - The changes planned so far; the parents' files are changed in it
 * @param created - The groups adding creates, each with its parent
 * @param existingFiles - The import's files as they are, by path
 * @param layout - Where the import's files are
 * @returns Nothing; `files` holds the changes
 * @example
 * ```ts
 * withInnerGroups(files, [{ name: "lines", parent: "invoices" }], existing, layout);
 * ```
 */
export function withInnerGroups(
  files: FileChange[],
  created: readonly NewGroup[],
  existingFiles: Record<string, string>,
  layout: ImportLayout,
): void {
  const byParent = new Map<string, string[]>();
  for (const { name, parent } of created) {
    if (parent === undefined || !Object.hasOwn(existingFiles, layout.groupFile(parent))) continue;
    byParent.set(parent, [...(byParent.get(parent) ?? []), name]);
  }
  for (const [parent, inner] of byParent) {
    const path = layout.groupFile(parent);
    const planned = files.find((file) => file.path === path);
    const current = planned?.content ?? existingFiles[path] ?? "";
    /* An inner group is imported as the file imports the rest. */
    const parsed = parseSource(path, current);
    const extension =
      parsed.problem === null && importsCarryExtensions(parsed.program) ? ".js" : "";
    const content = addGroupsToGroupFile(
      path,
      current,
      parent,
      inner.map((name) => ({
        name,
        local: `${name}Group`,
        importPath: `${layout.innerGroupSpecifier(name)}${extension}`,
      })),
    );
    if (planned) planned.content = content;
    else files.push({ path, content, action: "modify", generatedEndpoints: {} });
  }
}
