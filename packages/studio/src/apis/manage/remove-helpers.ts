/**
 * Helpers for endpoint removal: file lookup, group deletion collection,
 * and user-modification warning detection.
 */

import type { ImportLayout } from "../layout";
import { extractEndpoints } from "../merge/extract-endpoints";
import { computeHash } from "../merge/hash";

/** The group's endpoint file, when it is on disk: the one path the layout gives it */
export function findGroupFile(
  layout: ImportLayout,
  groupName: string,
  existingFiles: Record<string, string>,
): string | undefined {
  const path = layout.groupFile(groupName);
  return Object.hasOwn(existingFiles, path) ? path : undefined;
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
 * them, as `group.endpoint`: each is compared with what Studio recorded for
 * its own group's file, so endpoints of one name in two groups never stand
 * in for each other.
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
    const file = findGroupFile(layout, group, existingFiles);
    if (file === undefined) continue;
    const onDisk = extractEndpoints(existingFiles[file] ?? "");
    for (const name of names) {
      const stored = fingerprints[file]?.[name];
      const code = onDisk[name];
      if (stored && code !== undefined && stored !== computeHash(code))
        warnings.push(`${group}.${name}`);
    }
  }
}
