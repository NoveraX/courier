/**
 * Single-source merge logic — merges scan + runtime data for one source entry.
 */

import type { SourceMap } from "@noverax/nexus-devtools-core";
import type { InputEndpoint } from "./merge-converters";
import { endpointFromRuntime, endpointFromScan, groupFromRuntime } from "./merge-converters";
import type { CatalogEndpoint, CatalogEntry, CatalogGroup } from "./types";

/** Merge a single source entry: scan base + runtime overlay */
export function mergeSource(scan: SourceMap[string], rt: SourceMap[string] | null): CatalogEntry {
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

  // Scan layer re-resolves env vars on every run — freshest baseURL source.
  // Runtime SourceMap captures baseURL at defineApi() call time — may be stale.
  return { baseURL: scan.baseURL || rt?.baseURL || "", groups };
}

/** Merge endpoint: runtime wins for shared fields, scan fills gaps */
export function mergeEndpoint(scan: InputEndpoint, rt: InputEndpoint): CatalogEndpoint {
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
