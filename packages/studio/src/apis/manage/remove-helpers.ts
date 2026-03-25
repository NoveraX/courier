/**
 * Helpers for endpoint removal: file lookup, group deletion collection,
 * and user-modification warning detection.
 */

import { extractEndpoints } from "../merge/extract-endpoints";
import { computeHash } from "../merge/hash";

/** Find the main group file (index.ts or groupName.ts) within a group dir */
export function findGroupFile(
  baseDir: string,
  groupName: string,
  existingFiles: Record<string, string>,
): string | undefined {
  const dirPrefix = `${baseDir}/${groupName}/`;
  return (
    Object.keys(existingFiles).find((p) => p.startsWith(dirPrefix) && p.endsWith("/index.ts")) ??
    Object.keys(existingFiles).find(
      (p) => p.startsWith(dirPrefix) && p.endsWith(`/${groupName}.ts`),
    )
  );
}

/** Collect all files in a group directory for deletion */
export function collectGroupDeletions(
  baseDir: string,
  groupName: string,
  existingFiles: Record<string, string>,
  deletedFiles: string[],
): void {
  const dirPrefix = `${baseDir}/${groupName}/`;
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
