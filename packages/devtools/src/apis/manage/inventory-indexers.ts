/**
 * Index builders for endpoint inventory — create lookup maps from
 * spec groups, disk groups, and file hashes.
 */

import { extractEndpoints } from "../merge/extract-endpoints";
import { computeHash } from "../merge/hash";
import type { ParsedGroup } from "../parser/types";
import type { ScannedGroup } from "../scanner/types";

export interface SpecGroupInfo {
  prefix: string;
  endpoints: Array<{ name: string; httpMethod: string; path: string }>;
}

export interface DiskGroupInfo {
  prefix: string;
  endpoints: Array<{ name: string; httpMethod: string; path: string }>;
}

export function buildSpecMap(groups: ParsedGroup[]): Map<string, SpecGroupInfo> {
  const map = new Map<string, SpecGroupInfo>();
  for (const g of groups) {
    map.set(g.name, {
      prefix: g.prefix,
      endpoints: g.endpoints.map((e) => ({
        name: e.name,
        httpMethod: e.httpMethod,
        path: e.path,
      })),
    });
  }
  return map;
}

export function buildDiskMap(groups: ScannedGroup[]): Map<string, DiskGroupInfo> {
  const map = new Map<string, DiskGroupInfo>();
  for (const g of groups) {
    map.set(g.name, {
      prefix: g.prefix,
      endpoints: g.endpoints.map((e) => ({
        name: e.name,
        httpMethod: e.analysis.httpMethod,
        path: e.analysis.path,
      })),
    });
  }
  return map;
}

export function buildDiskHashes(existingFiles: Record<string, string>): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const content of Object.values(existingFiles)) {
    const eps = extractEndpoints(content);
    for (const [name, code] of Object.entries(eps)) {
      hashes[name] = computeHash(code);
    }
  }
  return hashes;
}
