import { transformSpec } from "../generator/transform-spec";
import type { GenerateOptions } from "../generator/types";
import type { ImportLayout } from "../layout";
import { isTopLevel } from "../parser/top-level";
import type { ParsedSpec } from "../parser/types";
import { diskListing } from "./disk-listing";
import { buildDiskMap, buildSpecMap } from "./inventory-indexers";
import { pairedGroups } from "./paired-groups";

/**
 * The files of an import's groups that Studio now names otherwise, each by
 * the file its code is written to now, with the file on disk that holds
 * it: a group renamed, as one whose tag spells no name became `users` where
 * Studio 0.3.0 named it `group`, is the group on disk it is paired with, as
 * the inventory lists it. Merged by path alone, a renamed group's endpoints
 * a user added or edited stayed in the file at its old path — another
 * group's now — or went with it.
 *
 * @param spec - The specification the import is generated from
 * @param groupBy - How the import groups its endpoints
 * @param layout - Where the import's files are
 * @param files - The import's files on disk, by path
 * @returns The file on disk each renamed group's file is written from, by the file it is written to
 * @example
 * ```ts
 * renamedGroupFiles(spec, "tag", layout, files).get("src/api/shop/users/index.ts");
 * // → "src/api/shop/group/index.ts"
 * ```
 */
export function renamedGroupFiles(
  spec: ParsedSpec,
  groupBy: GenerateOptions["groupBy"],
  layout: ImportLayout,
  files: Readonly<Record<string, string>>,
): Map<string, string> {
  const specMap = buildSpecMap(transformSpec(spec, { groupBy: groupBy ?? "tag" }).groups);
  const diskMap = buildDiskMap(diskListing(layout, files));
  const moved = new Map<string, string>();
  for (const [group, onDisk] of pairedGroups(specMap, diskMap)) {
    /* The API's own endpoints are its source's, whatever its groups are named. */
    if (group === onDisk || isTopLevel(group) || isTopLevel(onDisk)) continue;
    const from = diskMap.get(onDisk)?.file;
    const to = layout.groupFile(group);
    if (from !== undefined && from !== to) moved.set(to, from);
  }
  return moved;
}
