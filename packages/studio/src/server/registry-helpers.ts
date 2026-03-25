/**
 * Helpers for registry routes: spec fetching, fingerprint collection, update checks.
 *
 * Re-exports from focused modules so existing imports remain valid.
 */

import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ParsedSpec } from "../apis";
import {
  createSpecDigest,
  loadCache,
  loadDigestCache,
  saveCache,
  saveDigestCache,
  updateCachedDigest,
  updateCachedFingerprints,
} from "../apis";
import { resolveProjectSafe } from "../context";

export { errMsg, readFilesFromDisk, writeFileWithDirs } from "./fs-helpers";
export {
  buildFallbackFingerprints,
  collectFingerprints,
  detectUserModified,
} from "./registry-fingerprints";
export { checkSingleSource, fetchSpecRaw } from "./registry-spec";

/** Persist fingerprint and digest caches for a source in one call */
export function persistCaches(
  sourceName: string,
  fingerprints: Record<string, string>,
  spec: ParsedSpec,
): void {
  const cache = loadCache();
  saveCache(updateCachedFingerprints(cache, sourceName, fingerprints));

  const digestCache = loadDigestCache();
  saveDigestCache(updateCachedDigest(digestCache, sourceName, createSpecDigest(spec)));
}

/** Remove generated files from disk for a source. */
export function removeGeneratedFiles(outputDir: string, name: string): void {
  const dir = resolveProjectSafe(join(outputDir, name));
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Count group subdirectories on disk for a source. */
export function countGroupsOnDisk(outputDir: string, name: string): number {
  const dir = resolveProjectSafe(join(outputDir, name));
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((entry) => {
    return statSync(join(dir, entry)).isDirectory();
  }).length;
}
