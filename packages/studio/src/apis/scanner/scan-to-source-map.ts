/**
 * Converts scanner results to the SourceMap format used by the Studio UI.
 *
 * This allows the studio server to push fresh endpoint metadata to the UI
 * directly from file system analysis — no runtime registry dependency.
 */

import type { ScanResult } from "./types";

interface EndpointInfo {
  type: "query" | "mutation";
  hasVariablesSchema: boolean;
  hasResponseSchema: boolean;
}

interface GroupInfo {
  prefix: string;
  endpoints: Record<string, EndpointInfo>;
}

interface SourceInfo {
  baseURL: string;
  groups: Record<string, GroupInfo>;
}

type SourceMap = Record<string, SourceInfo>;

/** Convert a ScanResult to a SourceMap (same shape the UI sessions use) */
export function scanToSourceMap(scan: ScanResult): SourceMap {
  const result: SourceMap = {};

  for (const source of scan.sources) {
    const groups: Record<string, GroupInfo> = {};

    for (const group of source.groups) {
      const endpoints: Record<string, EndpointInfo> = {};
      for (const ep of group.endpoints) {
        endpoints[ep.name] = {
          type: ep.analysis.type ?? "query",
          hasVariablesSchema: ep.analysis.hasVariablesType,
          hasResponseSchema: ep.analysis.hasResponseType,
        };
      }
      groups[group.name] = { prefix: group.prefix, endpoints };
    }

    /* Flat (inline) endpoints go into a group with empty name */
    if (source.inlineEndpoints?.length) {
      const endpoints: Record<string, EndpointInfo> = {};
      for (const ep of source.inlineEndpoints) {
        endpoints[ep.name] = {
          type: ep.analysis.type ?? "query",
          hasVariablesSchema: ep.analysis.hasVariablesType,
          hasResponseSchema: ep.analysis.hasResponseType,
        };
      }
      groups[""] = { prefix: "", endpoints };
    }

    result[source.name] = { baseURL: source.baseURL, groups };
  }

  return result;
}
