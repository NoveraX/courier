import type { ImportLayout } from "../apis/layout";
import { endpointFile } from "../apis/manage/remove-helpers";
import { extractEndpoints } from "../apis/merge/extract-endpoints";
import { isTopLevel, qualifiedName } from "../apis/parser/top-level";

/**
 * The endpoints a request asks to remove that the import's files do not
 * hold, as `group.endpoint`, the API's own by name alone: a group without a
 * file, or a name its file does not declare. The API's own endpoints are in
 * its source; a flat import has no others.
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
  const fileOf = (group: string): string | undefined =>
    flat && !isTopLevel(group) ? undefined : endpointFile(layout, group, onDisk);
  const unknown: string[] = [];
  for (const [group, names] of Object.entries(toRemove)) {
    const file = fileOf(group);
    const content = file !== undefined && Object.hasOwn(onDisk, file) ? onDisk[file] : undefined;
    const held = new Set(content === undefined ? [] : Object.keys(extractEndpoints(content)));
    unknown.push(
      ...names.filter((name) => !held.has(name)).map((name) => qualifiedName(group, name)),
    );
  }
  return unknown;
}
