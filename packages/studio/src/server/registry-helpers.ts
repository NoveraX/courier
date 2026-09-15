/**
 * Helpers for imports routes: spec fetching, fingerprint collection, and
 * on-disk cleanup of generated files.
 *
 * Re-exports from focused modules so existing imports remain valid.
 */

import { existsSync, rmdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { resolveProjectSafe } from "../context";

export { errMsg, readFilesFromDisk, writeFileWithDirs } from "./fs-helpers";
export {
  buildFallbackFingerprints,
  collectFingerprints,
  detectUserModified,
} from "./registry-fingerprints";
export { checkSingleSource, fetchSpecRaw } from "./registry-spec";

/**
 * Delete every file Studio recorded in an import's `generatedFiles` list.
 * Paths are project-relative — each is resolved safely before unlink. A
 * missing file is a no-op; any other filesystem error propagates so the
 * caller can decide whether to compensate or surface it.
 *
 * After each delete the parent directory is pruned if it became empty, so
 * orphaned `<outputDir>/<sourceName>/` trees clean themselves up.
 */
export function removeGeneratedFiles(paths: string[]): void {
  const parents = new Set<string>();
  for (const relPath of paths) {
    const abs = resolveProjectSafe(relPath);
    try {
      unlinkSync(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    parents.add(dirname(abs));
  }

  /* Walk parents from deepest to shallowest, removing each if empty. */
  const sorted = Array.from(parents).sort((a, b) => b.length - a.length);
  for (const dir of sorted) {
    if (!existsSync(dir)) continue;
    try {
      rmdirSync(dir);
    } catch {
      /* Directory not empty — leave it alone. */
    }
  }
}
