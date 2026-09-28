import type { ImportLayout } from "../apis/layout";
import { FLAT_GROUP } from "../apis/manage/flat-import";
import { findGroupFile } from "../apis/manage/remove-helpers";
import { extractEndpoints } from "../apis/merge/extract-endpoints";

/**
 * The endpoints a request asks to remove that the import's files do not
 * hold, as `group.endpoint`: a group without a file, or a name its file
 * does not declare. A flat import holds its endpoints in its source.
 *
 * @param toRemove - The endpoints to remove, by group
 * @param layout - Where the import's files are
 * @param onDisk - The import's files as they are, by path
 * @param flat - Whether the import is generated as one flat group
 * @returns The endpoints not there to remove; none when every one is
 * @example
 * ```ts
 * unknownRemovals({ pets: ["nosuch"] }, layout, onDisk, false); // → ["pets.nosuch"]
 * ```
 */
export function unknownRemovals(
  toRemove: Record<string, string[]>,
  layout: ImportLayout,
  onDisk: Readonly<Record<string, string>>,
  flat: boolean,
): string[] {
  const fileOf = (group: string): string | undefined => {
    if (!flat) return findGroupFile(layout, group, onDisk);
    return group === FLAT_GROUP ? layout.sourceFile : undefined;
  };
  const unknown: string[] = [];
  for (const [group, names] of Object.entries(toRemove)) {
    const file = fileOf(group);
    const content = file !== undefined && Object.hasOwn(onDisk, file) ? onDisk[file] : undefined;
    const held = new Set(content === undefined ? [] : Object.keys(extractEndpoints(content)));
    unknown.push(...names.filter((name) => !held.has(name)).map((name) => `${group}.${name}`));
  }
  return unknown;
}
