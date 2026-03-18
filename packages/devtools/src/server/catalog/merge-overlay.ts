/**
 * Layered overlay merge — combines scan layer (structural truth) with
 * runtime layers (enriched metadata) into a single authoritative Catalog.
 *
 * Inspired by OverlayFS: scan is the read-only base, runtime overlays on top.
 * Runtime fields win where present, scan fills gaps.
 */

import type { SourceMap } from "@noverax/nexus-devtools-core";
import { canonicalKey, deduplicateKeys } from "./normalize";
import type {
  Catalog,
  CatalogEndpoint,
  CatalogEntry,
  CatalogGroup,
  MergeResult,
  NameMapping,
} from "./types";

/** Input SourceMap endpoint shape (from both scanner and runtime) */
type InputEndpoint = SourceMap[string]["groups"][string]["endpoints"][string];

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

    // Build name mapping: runtime key → canonical (scanner) key
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

/** Merge a single source entry: scan base + runtime overlay */
function mergeSource(scan: SourceMap[string], rt: SourceMap[string] | null): CatalogEntry {
  const groups: Record<string, CatalogGroup> = {};

  for (const [groupName, scanGroup] of Object.entries(scan.groups)) {
    const rtGroup = rt?.groups[groupName];
    const endpoints: Record<string, CatalogEndpoint> = {};

    for (const [epName, scanEp] of Object.entries(scanGroup.endpoints)) {
      const rtEp = rtGroup?.endpoints[epName];
      endpoints[epName] = rtEp ? mergeEndpoint(scanEp, rtEp) : endpointFromScan(scanEp);
    }

    // Runtime-only endpoints within this group
    if (rtGroup) {
      for (const [epName, rtEp] of Object.entries(rtGroup.endpoints)) {
        if (!endpoints[epName]) {
          endpoints[epName] = endpointFromRuntime(rtEp);
        }
      }
    }

    groups[groupName] = { prefix: rtGroup?.prefix ?? scanGroup.prefix, endpoints };
  }

  // Runtime-only groups
  if (rt) {
    for (const [groupName, rtGroup] of Object.entries(rt.groups)) {
      if (groups[groupName]) continue;
      groups[groupName] = groupFromRuntime(rtGroup);
    }
  }

  return { baseURL: rt?.baseURL ?? scan.baseURL, groups };
}

/** Merge endpoint: runtime wins for shared fields, scan fills gaps */
function mergeEndpoint(scan: InputEndpoint, rt: InputEndpoint): CatalogEndpoint {
  return {
    type: rt.type ?? scan.type,
    hasVariablesSchema: rt.hasVariablesSchema || scan.hasVariablesSchema,
    hasResponseSchema: rt.hasResponseSchema || scan.hasResponseSchema,
    path: rt.path ?? scan.path,
    middleware: rt.middleware,
    ...(rt.variablesStub && { variablesStub: rt.variablesStub }),
    origin: "both",
  };
}

function endpointFromScan(ep: InputEndpoint): CatalogEndpoint {
  return {
    type: ep.type,
    hasVariablesSchema: ep.hasVariablesSchema,
    hasResponseSchema: ep.hasResponseSchema,
    path: ep.path,
    origin: "scan",
  };
}

function endpointFromRuntime(ep: InputEndpoint): CatalogEndpoint {
  return {
    type: ep.type,
    hasVariablesSchema: ep.hasVariablesSchema,
    hasResponseSchema: ep.hasResponseSchema,
    path: ep.path,
    middleware: ep.middleware,
    ...(ep.variablesStub && { variablesStub: ep.variablesStub }),
    origin: "runtime",
  };
}

function groupFromRuntime(group: SourceMap[string]["groups"][string]): CatalogGroup {
  const endpoints: Record<string, CatalogEndpoint> = {};
  for (const [name, ep] of Object.entries(group.endpoints)) {
    endpoints[name] = endpointFromRuntime(ep);
  }
  return { prefix: group.prefix, endpoints };
}

/** Convert entire runtime SourceMap entry to CatalogEntry */
function sourceFromRuntime(source: SourceMap[string]): CatalogEntry {
  const groups: Record<string, CatalogGroup> = {};
  for (const [name, group] of Object.entries(source.groups)) {
    groups[name] = groupFromRuntime(group);
  }
  return { baseURL: source.baseURL, groups };
}

/** Convert entire scan SourceMap to Catalog (no runtime) */
function catalogFromScan(scan: SourceMap): Catalog {
  const catalog: Catalog = {};
  for (const [key, source] of Object.entries(scan)) {
    const groups: Record<string, CatalogGroup> = {};
    for (const [gName, group] of Object.entries(source.groups)) {
      const endpoints: Record<string, CatalogEndpoint> = {};
      for (const [eName, ep] of Object.entries(group.endpoints)) {
        endpoints[eName] = endpointFromScan(ep);
      }
      groups[gName] = { prefix: group.prefix, endpoints };
    }
    catalog[key] = { baseURL: source.baseURL, groups };
  }
  return catalog;
}

/** Convert runtime-only SourceMap to Catalog */
function catalogFromRuntime(runtime: SourceMap): Catalog {
  const catalog: Catalog = {};
  for (const [key, source] of Object.entries(runtime)) {
    catalog[key] = sourceFromRuntime(source);
  }
  return catalog;
}

/** Index a SourceMap by canonical key */
function indexByCanon(map: SourceMap): Map<string, SourceMap[string]> {
  const index = new Map<string, SourceMap[string]>();
  for (const [key, source] of Object.entries(map)) {
    index.set(canonicalKey(key), source);
  }
  return index;
}

/** Find a source in a SourceMap by canonical key */
function findByCanon(map: SourceMap, canon: string): SourceMap[string] | undefined {
  for (const [key, source] of Object.entries(map)) {
    if (canonicalKey(key) === canon) return source;
  }
  return undefined;
}
