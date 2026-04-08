/**
 * Conversion utilities for building Catalog structures from
 * scan-only or runtime-only SourceMap data.
 */

import type { SourceMap } from "@noverax/nexus-studio-core";
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
    ...(ep.transport && { transport: ep.transport }),
    ...(ep.hasReceiveSchema && { hasReceiveSchema: true }),
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
    ...(ep.transport && { transport: ep.transport }),
    ...(ep.hasReceiveSchema && { hasReceiveSchema: true }),
    origin: "runtime",
  };
}

/**
 * Convert SourceMap data into Catalog shapes. These functions run on every
 * `connection:init` / `connection:sources` event from a connected app, so
 * they treat the input as untrusted: a misbehaving (or differently-versioned)
 * client can send a partial source object, and we must not crash the studio
 * dev server. Missing groups/endpoints/baseURL collapse to empty values.
 */

/** Coerce a possibly-undefined record to a safe Object.entries iterator */
function safeEntries<T>(value: Record<string, T> | null | undefined): Array<[string, T]> {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value);
}

export function groupFromRuntime(
  group: SourceMap[string]["groups"][string] | null | undefined,
): CatalogGroup {
  const endpoints: Record<string, CatalogEndpoint> = {};
  for (const [name, ep] of safeEntries(group?.endpoints)) {
    endpoints[name] = endpointFromRuntime(ep);
  }
  return { prefix: group?.prefix ?? "", endpoints };
}

/** Convert entire runtime SourceMap entry to CatalogEntry */
export function sourceFromRuntime(source: SourceMap[string] | null | undefined): CatalogEntry {
  const groups: Record<string, CatalogGroup> = {};
  for (const [name, group] of safeEntries(source?.groups)) {
    groups[name] = groupFromRuntime(group);
  }
  return {
    baseURL: source?.baseURL ?? "",
    ...(source?.appOrigin && { appOrigin: source.appOrigin }),
    ...(source?.proxyPath && { proxyPath: source.proxyPath }),
    groups,
  };
}

/** Convert entire scan SourceMap to Catalog (no runtime) */
export function catalogFromScan(scan: SourceMap | null | undefined): Catalog {
  const catalog: Catalog = {};
  for (const [key, source] of safeEntries(scan)) {
    const groups: Record<string, CatalogGroup> = {};
    for (const [gName, group] of safeEntries(source?.groups)) {
      const endpoints: Record<string, CatalogEndpoint> = {};
      for (const [eName, ep] of safeEntries(group?.endpoints)) {
        endpoints[eName] = endpointFromScan(ep);
      }
      groups[gName] = { prefix: group?.prefix ?? "", endpoints };
    }
    // Scan layer never carries proxyPath — the AST scanner cannot resolve
    // arbitrary expressions in `defineApi({ proxyPath: ... })`. The runtime
    // layer is the only source of truth for this field.
    catalog[key] = { baseURL: source?.baseURL ?? "", groups };
  }
  return catalog;
}

/** Convert runtime-only SourceMap to Catalog */
export function catalogFromRuntime(runtime: SourceMap | null | undefined): Catalog {
  const catalog: Catalog = {};
  for (const [key, source] of safeEntries(runtime)) {
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
