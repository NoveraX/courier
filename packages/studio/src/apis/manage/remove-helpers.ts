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

/** Detect endpoints modified by the user (disk hash differs from stored fingerprint) */
export function collectModifiedWarnings(
  endpointsToRemove: Record<string, string[]>,
  fingerprints: Record<string, string>,
  existingFiles: Record<string, string>,
  warnings: string[],
): void {
  const diskHashes: Record<string, string> = {};
  for (const content of Object.values(existingFiles)) {
    for (const [name, code] of Object.entries(extractEndpoints(content))) {
      diskHashes[name] = computeHash(code);
    }
  }

  for (const names of Object.values(endpointsToRemove)) {
    for (const name of names) {
      const stored = fingerprints[name];
      const disk = diskHashes[name];
      if (stored && disk && stored !== disk) warnings.push(name);
    }
  }
}
