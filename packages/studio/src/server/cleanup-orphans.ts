/**
 * Recursively removes generated .ts files that are no longer
 * part of the current generation set, then cleans empty directories.
 */

import { existsSync, lstatSync, readdirSync, rmdirSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { createLogger } from "@noverax/nexus";
import { resolveProjectSafe } from "../context";

const log = createLogger("Cleanup");

export function cleanupOrphanFiles(outputDir: string, newPaths: Set<string>): number {
  const absDir = resolveProjectSafe(outputDir);
  if (!existsSync(absDir)) return 0;

  try {
    return removeOrphansRecursive(absDir, newPaths, absDir);
  } catch (err) {
    log.warn("Orphan cleanup failed", err);
    return 0;
  }
}

function removeOrphansRecursive(dir: string, newPaths: Set<string>, root: string): number {
  const entries = readdirSync(dir, { withFileTypes: true });
  let deleted = 0;

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    /* Skip symlinks — don't follow them to avoid escaping project root */
    if (lstatSync(fullPath).isSymbolicLink()) {
      unlinkSync(fullPath);
      continue;
    }

    /* Verify resolved path stays within project root */
    const real = resolve(fullPath);
    if (!real.startsWith(`${root}/`)) continue;

    if (entry.isDirectory()) {
      deleted += removeOrphansRecursive(fullPath, newPaths, root);
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
