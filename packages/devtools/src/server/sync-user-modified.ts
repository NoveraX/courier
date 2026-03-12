/**
 * Detects user-modified endpoints by comparing disk fingerprints against cache.
 */

import { readFileSync } from "node:fs";
import { generateFingerprints } from "../codegen/merge/fingerprint";
import type { FingerprintCache } from "../codegen/registry/cache";
import { getCachedFingerprints } from "../codegen/registry/cache";
import { saveRegistry } from "../codegen/registry/registry";
import type { RegistryConfig, RegistrySource } from "../codegen/registry/types";
import { resolveProjectSafe } from "../context";

interface Snapshot {
  invalidate: () => void;
  getCache: () => FingerprintCache;
  getRegistry: () => RegistryConfig;
}

/** Compute modified set for a single source, returns null if unchanged */
function computeModifiedSet(
  source: RegistrySource,
  cached: Record<string, string>,
  diskFps: Record<string, string>,
): string[] | null {
  const newModified = new Set(source.userModified);
  let changed = false;

  for (const [name, diskHash] of Object.entries(diskFps)) {
    const cachedHash = cached[name];
    if (!cachedHash) continue;

    if (diskHash !== cachedHash && !newModified.has(name)) {
      newModified.add(name);
      changed = true;
    } else if (diskHash === cachedHash && newModified.has(name)) {
      newModified.delete(name);
      changed = true;
    }
  }

  return changed ? [...newModified] : null;
}

/** Compare changed file's endpoints against cached fingerprints */
export function syncUserModified(filePath: string, snapshot: Snapshot): void {
  try {
    const content = readFileSync(resolveProjectSafe(filePath), "utf-8");
    const diskFps = generateFingerprints(content);
    if (Object.keys(diskFps).length === 0) return;

    const cache = snapshot.getCache();
    const config = snapshot.getRegistry();
    let anyChanged = false;

    for (const [sourceName, source] of Object.entries(config.sources)) {
      const cached = getCachedFingerprints(cache, sourceName);
      if (Object.keys(cached).length === 0) continue;

      const modified = computeModifiedSet(source, cached, diskFps);
      if (modified) {
        config.sources[sourceName] = { ...source, userModified: modified };
        anyChanged = true;
      }
    }

    if (anyChanged) {
      saveRegistry(config);
      snapshot.invalidate();
    }
  } catch (err) {
    console.warn("Failed to sync user-modified:", err);
  }
}
