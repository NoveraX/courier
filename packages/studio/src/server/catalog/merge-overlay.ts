/**
 * Layered overlay merge — combines scan layer (structural truth) with
 * runtime layers (enriched metadata) into a single authoritative Catalog.
 *
 * Inspired by OverlayFS: scan is the read-only base, runtime overlays on top.
 * Runtime fields win where present, scan fills gaps.
 */

import type { SourceMap } from "@noverax/nexus-studio-core";
import {
  catalogFromRuntime,
  catalogFromScan,
  findByCanon,
  indexByCanon,
  sourceFromRuntime,
} from "./merge-converters";
import { mergeSource } from "./merge-source";
import { canonicalKey, deduplicateKeys } from "./normalize";
import type { Catalog, MergeResult, NameMapping } from "./types";

/**
 * Merge scan layer + runtime layers into a single Catalog.
 *
 * @param scanLayer   - AST-derived SourceMap (null if scanner unavailable)
 * @param runtimeLayers - Per-session runtime SourceMaps (freshest entry wins)
 */
export function mergeOverlay(
  scanLayer: SourceMap | null,
  runtimeLayers: Map<string, SourceMap>,
): MergeResult {
  const runtimeMerged = mergeRuntimeLayers(runtimeLayers);
  const hasScan = scanLayer !== null;
  const hasRuntime = runtimeMerged !== null;

  if (!hasScan && !hasRuntime) return { catalog: {}, nameMapping: {} };
  if (!hasScan) return { catalog: catalogFromRuntime(runtimeMerged as SourceMap), nameMapping: {} };
  if (!hasRuntime) return { catalog: catalogFromScan(scanLayer), nameMapping: {} };

  return mergeLayers(scanLayer, runtimeMerged as SourceMap);
}

/** Merge multiple runtime sessions into one (freshest key wins) */
function mergeRuntimeLayers(layers: Map<string, SourceMap>): SourceMap | null {
  if (layers.size === 0) return null;

  const merged: SourceMap = {};
  for (const [, sourceMap] of layers) {
    for (const [key, source] of Object.entries(sourceMap)) {
      const canon = canonicalKey(key);
      const existing = Object.keys(merged).find((k) => canonicalKey(k) === canon);
      merged[existing ?? key] = source;
    }
  }
  return merged;
}

/** Full merge: scan base + runtime overlay, compute name mappings */
function mergeLayers(scan: SourceMap, runtime: SourceMap): MergeResult {
  const catalog: Catalog = {};
  const nameMapping: NameMapping = {};
  const scanKeys = deduplicateKeys(Object.keys(scan));
  const runtimeByCanon = indexByCanon(runtime);

  // Step 1: scan entries as base, overlay runtime where available
  for (const [canon, displayName] of scanKeys) {
    const scanSource = findByCanon(scan, canon)!;
    const rtSource = runtimeByCanon.get(canon);
    catalog[displayName] = mergeSource(scanSource, rtSource ?? null);

    // Build name mapping: runtime key -> canonical (scanner) key
    for (const rtKey of Object.keys(runtime)) {
      if (canonicalKey(rtKey) === canon && rtKey !== displayName) {
        nameMapping[rtKey] = displayName;
      }
    }
  }

  // Step 2: runtime-only entries (new code scanner hasn't picked up yet)
  for (const [canon, rtSource] of runtimeByCanon) {
    if (scanKeys.has(canon)) continue;
    const key = Object.keys(runtime).find((k) => canonicalKey(k) === canon)!;
    catalog[key] = sourceFromRuntime(rtSource);
  }

  return { catalog, nameMapping };
}
