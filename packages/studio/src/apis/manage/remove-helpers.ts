/**
 * Helpers for endpoint removal: file lookup, group deletion collection,
 * and user-modification warning detection.
 */

import type { ImportLayout } from "../layout";
import { extractEndpoints } from "../merge/extract-endpoints";
import { computeHash } from "../merge/hash";
import { ownValue } from "../own-value";
import { isTopLevel, qualifiedName } from "../parser/top-level";

/** The group's endpoint file, when it is on disk: the one path the layout gives it */
export function findGroupFile(
  layout: ImportLayout,
  groupName: string,
  existingFiles: Record<string, string>,
): string | undefined {
  const path = layout.groupFile(groupName);
  return Object.hasOwn(existingFiles, path) ? path : undefined;
}

/**
 * The file holding a group's endpoints, when it is on disk: the group's
 * own file, or the import's source for the API's own endpoints.
 *
 * @param layout - Where the import's files are
 * @param groupName - The group, or `""` for the API itself
 * @param existingFiles - The import's files as they are, by path
 * @returns The file's path, or `undefined` when it is not on disk
 * @example
 * ```ts
 * endpointFile(layout, "", files); // "src/api/pets/source.ts"
 * ```
 */
export function endpointFile(
  layout: ImportLayout,
  groupName: string,
  existingFiles: Record<string, string>,
): string | undefined {
  if (!isTopLevel(groupName)) return findGroupFile(layout, groupName, existingFiles);
  return Object.hasOwn(existingFiles, layout.sourceFile) ? layout.sourceFile : undefined;
}

/** Collect all files in a group directory for deletion */
export function collectGroupDeletions(
  layout: ImportLayout,
  groupName: string,
  existingFiles: Record<string, string>,
  deletedFiles: string[],
): void {
  const dirPrefix = `${layout.groupDir(groupName)}/`;
  for (const path of Object.keys(existingFiles)) {
    if (path.startsWith(dirPrefix) && !deletedFiles.includes(path)) {
      deletedFiles.push(path);
    }
  }
}

/**
 * Name the endpoints being removed that the user edited since Studio wrote
 * them, as `group.endpoint`, the API's own by their name alone: each is
 * compared with what Studio recorded for its own group's file, so endpoints
 * of one name in two groups never stand in for each other.
 *
 * @param endpointsToRemove - The endpoints to remove, by group
 * @param fingerprints - Studio's recorded endpoint fingerprints, by file
 * @param existingFiles - The import's files as they are
 * @param layout - Where the import's files are
 * @param warnings - Where the edited ones are named
 */
export function collectModifiedWarnings(
  endpointsToRemove: Record<string, string[]>,
  fingerprints: Record<string, Record<string, string>>,
  existingFiles: Record<string, string>,
  layout: ImportLayout,
  warnings: string[],
): void {
  for (const [group, names] of Object.entries(endpointsToRemove)) {
    const file = endpointFile(layout, group, existingFiles);
    if (file === undefined) continue;
    const onDisk = extractEndpoints(existingFiles[file] ?? "");
    for (const name of names) {
      const stored = ownValue(fingerprints[file] ?? {}, name);
      const code = ownValue(onDisk, name);
      if (stored && code !== undefined && stored !== computeHash(code))
        warnings.push(qualifiedName(group, name));
    }
  }
}
