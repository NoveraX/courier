/**
 * Conversion utilities for building Catalog structures from
 * scan-only or runtime-only SourceMap data.
 */

import type { SourceMap } from "@noverax/nexus-devtools-core";
import { canonicalKey } from "./normalize";
import type { Catalog, CatalogEndpoint, CatalogEntry, CatalogGroup } from "./types";

/** Input SourceMap endpoint shape (from both scanner and runtime) */
export type InputEndpoint = SourceMap[string]["groups"][string]["endpoints"][string];

export function endpointFromScan(ep: InputEndpoint): CatalogEndpoint {
  return {
    type: ep.type,
    hasVariablesSchema: ep.hasVariablesSchema,
    hasResponseSchema: ep.hasResponseSchema,
    path: ep.path,
    origin: "scan",
  };
}

export function endpointFromRuntime(ep: InputEndpoint): CatalogEndpoint {
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

export function groupFromRuntime(group: SourceMap[string]["groups"][string]): CatalogGroup {
  const endpoints: Record<string, CatalogEndpoint> = {};
  for (const [name, ep] of Object.entries(group.endpoints)) {
    endpoints[name] = endpointFromRuntime(ep);
  }
  return { prefix: group.prefix, endpoints };
}

/** Convert entire runtime SourceMap entry to CatalogEntry */
export function sourceFromRuntime(source: SourceMap[string]): CatalogEntry {
  const groups: Record<string, CatalogGroup> = {};
  for (const [name, group] of Object.entries(source.groups)) {
    groups[name] = groupFromRuntime(group);
  }
  return { baseURL: source.baseURL, groups };
}

/** Convert entire scan SourceMap to Catalog (no runtime) */
export function catalogFromScan(scan: SourceMap): Catalog {
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
export function catalogFromRuntime(runtime: SourceMap): Catalog {
  const catalog: Catalog = {};
  for (const [key, source] of Object.entries(runtime)) {
    catalog[key] = sourceFromRuntime(source);
  }
  return catalog;
}

/** Index a SourceMap by canonical key */
export function indexByCanon(map: SourceMap): Map<string, SourceMap[string]> {
  const index = new Map<string, SourceMap[string]>();
  for (const [key, source] of Object.entries(map)) {
    index.set(canonicalKey(key), source);
  }
  return index;
}

/** Find a source in a SourceMap by canonical key */
export function findByCanon(map: SourceMap, canon: string): SourceMap[string] | undefined {
  for (const [key, source] of Object.entries(map)) {
    if (canonicalKey(key) === canon) return source;
  }
  return undefined;
}
