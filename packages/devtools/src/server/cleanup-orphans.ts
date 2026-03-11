/**
 * Recursively removes generated .ts files that are no longer
 * part of the current generation set, then cleans empty directories.
 */

import { existsSync, readdirSync, rmdirSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

export function cleanupOrphanFiles(outputDir: string, newPaths: Set<string>): number {
  const absDir = resolve(outputDir);
  if (!existsSync(absDir)) return 0;

  try {
    return removeOrphansRecursive(absDir, newPaths);
  } catch {
    return 0;
  }
}

function removeOrphansRecursive(dir: string, newPaths: Set<string>): number {
  const entries = readdirSync(dir, { withFileTypes: true });
  let deleted = 0;

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      deleted += removeOrphansRecursive(fullPath, newPaths);
      try {
        rmdirSync(fullPath);
      } catch {
        /* not empty */
      }
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    if (!newPaths.has(fullPath)) {
      unlinkSync(fullPath);
      deleted++;
    }
  }
  return deleted;
}
