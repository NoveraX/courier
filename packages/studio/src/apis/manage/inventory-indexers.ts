/**
 * Index builders for endpoint inventory — create lookup maps from
 * spec groups, disk groups, and file hashes.
 */

import { extractEndpoints } from "../merge/extract-endpoints";
import { computeHash } from "../merge/hash";
import type { ParsedGroup } from "../parser/types";
import type { DiskGroupListing } from "./types";

export interface SpecGroupInfo {
  prefix: string;
  endpoints: Array<{ name: string; httpMethod: string; path: string }>;
}

export interface DiskGroupInfo {
  prefix: string;
  endpoints: string[];
  file: string;
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

export function buildDiskMap(groups: DiskGroupListing[]): Map<string, DiskGroupInfo> {
  const map = new Map<string, DiskGroupInfo>();
  for (const g of groups) {
    map.set(g.name, { prefix: g.prefix, endpoints: g.endpoints, file: g.file });
  }
  return map;
}

/**
 * Hash each endpoint of one file, by endpoint name.
 *
 * @param content - The file, or `undefined` when there is none
 * @returns The hash of each endpoint's code
 */
export function endpointHashes(content: string | undefined): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const [name, code] of Object.entries(extractEndpoints(content ?? "")))
    hashes[name] = computeHash(code);
  return hashes;
}

/* An endpoint's code as the generator writes it starts with `endpoint.<method>("<path>")`. */
const ROUTE =
  /\bendpoint\s*\.\s*(get|head|options|query|post|put|patch|delete)\s*\(\s*(["'`])([^"'`\\]*)\2/;

/**
 * Read each endpoint's method and path from its code, for an endpoint the
 * specification no longer lists: the path relative to the group's prefix,
 * as the specification's endpoints are listed. An endpoint whose code
 * starts otherwise is left out.
 *
 * @param content - The file, or `undefined` when there is none
 * @returns The method and path of each endpoint whose code shows them
 * @example
 * ```ts
 * endpointRoutes('  listCustomers: endpoint.get("customers").response<Customer[]>(),');
 * // → { listCustomers: { httpMethod: "get", path: "/customers" } }
 * ```
 */
export function endpointRoutes(
  content: string | undefined,
): Record<string, { httpMethod: string; path: string }> {
  const routes: Record<string, { httpMethod: string; path: string }> = {};
  for (const [name, code] of Object.entries(extractEndpoints(content ?? ""))) {
    const route = ROUTE.exec(code);
    if (route?.[1] === undefined) continue;
    const path = route[3] ?? "";
    routes[name] = { httpMethod: route[1], path: path.startsWith("/") ? path : `/${path}` };
  }
  return routes;
}
