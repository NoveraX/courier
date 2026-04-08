/**
 * Single-source merge logic — merges scan + runtime data for one source entry.
 */

import type { SourceMap } from "@noverax/nexus-studio-core";
import type { InputEndpoint } from "./merge-converters";
import { endpointFromRuntime, endpointFromScan, groupFromRuntime } from "./merge-converters";
import type { CatalogEndpoint, CatalogEntry, CatalogGroup } from "./types";

/**
 * Defensive Object.entries — `rt` arrives over the socket from any
 * connected app and may be missing fields if the client is older or
 * misbehaving. Treat undefined/null as empty rather than crashing.
 */
function safeEntries<T>(value: Record<string, T> | null | undefined): Array<[string, T]> {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value);
}

/** Merge a single source entry: scan base + runtime overlay */
export function mergeSource(scan: SourceMap[string], rt: SourceMap[string] | null): CatalogEntry {
  const groups: Record<string, CatalogGroup> = {};
  const rtGroups = rt?.groups;

  for (const [groupName, scanGroup] of Object.entries(scan.groups)) {
    const rtGroup = rtGroups?.[groupName];
    const endpoints: Record<string, CatalogEndpoint> = {};

    for (const [epName, scanEp] of Object.entries(scanGroup.endpoints)) {
      const rtEp = rtGroup?.endpoints?.[epName];
      endpoints[epName] = rtEp ? mergeEndpoint(scanEp, rtEp) : endpointFromScan(scanEp);
    }

    // Runtime-only endpoints within this group
    for (const [epName, rtEp] of safeEntries(rtGroup?.endpoints)) {
      if (!endpoints[epName]) {
        endpoints[epName] = endpointFromRuntime(rtEp);
      }
    }

    groups[groupName] = { prefix: rtGroup?.prefix ?? scanGroup.prefix, endpoints };
  }

  // Runtime-only groups
  for (const [groupName, rtGroup] of safeEntries(rtGroups)) {
    if (groups[groupName]) continue;
    groups[groupName] = groupFromRuntime(rtGroup);
  }

  // Scan layer re-resolves env vars on every run — freshest baseURL source.
  // Runtime SourceMap captures baseURL at defineApi() call time — may be stale.
  // proxyPath and appOrigin are runtime-only (the AST scanner cannot
  // statically evaluate either — proxyPath is set in defineApi options and
  // appOrigin is declared at instrumentServer/connectStudio bootstrap time).
  return {
    baseURL: scan.baseURL || rt?.baseURL || "",
    ...(rt?.appOrigin && { appOrigin: rt.appOrigin }),
    ...(rt?.proxyPath && { proxyPath: rt.proxyPath }),
    groups,
  };
}

/** Merge endpoint: runtime wins for shared fields, scan fills gaps */
export function mergeEndpoint(scan: InputEndpoint, rt: InputEndpoint): CatalogEndpoint {
  const transport = rt.transport ?? scan.transport;
  return {
    type: rt.type ?? scan.type,
    hasVariablesSchema: rt.hasVariablesSchema || scan.hasVariablesSchema,
    hasResponseSchema: rt.hasResponseSchema || scan.hasResponseSchema,
    path: rt.path ?? scan.path,
    middleware: rt.middleware,
    ...(rt.variablesStub && { variablesStub: rt.variablesStub }),
    ...(transport && { transport }),
    ...((rt.hasReceiveSchema || scan.hasReceiveSchema) && { hasReceiveSchema: true }),
    origin: "both",
  };
}
