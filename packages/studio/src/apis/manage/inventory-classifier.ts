/**
 * Classifies endpoints within a group by cross-referencing spec and disk data.
 */

import { ownValue } from "../own-value";
import { classifyDiskEndpoint } from "./classify-endpoint";
import type { DiskGroupInfo, SpecGroupInfo } from "./inventory-indexers";
import type { InventoryEndpoint } from "./types";

/** Build classified endpoint list for a single group */
export function buildGroupEndpoints(
  groupName: string,
  specGroup: SpecGroupInfo | undefined,
  diskGroup: DiskGroupInfo | undefined,
  fingerprints: Record<string, string>,
  diskHashes: Record<string, string>,
  diskRoutes: Record<string, { httpMethod: string; path: string }> = {},
): InventoryEndpoint[] {
  const endpoints: InventoryEndpoint[] = [];

  // Disk endpoints: classify against spec + fingerprints. The canonical
  // `httpMethod`/`path` is the matching spec entry's (active endpoints); an
  // endpoint the spec does not list (custom or removed-from-spec) shows the
  // method and path its own code declares, when the code shows them.
  if (diskGroup) {
    for (const name of diskGroup.endpoints) {
      const endpoint = classifyDiskEndpoint(groupName, name, specGroup, fingerprints, diskHashes);
      const route = endpoint.httpMethod === "" ? ownValue(diskRoutes, name) : undefined;
      endpoints.push(route ? { ...endpoint, ...route } : endpoint);
    }
  }

  // Spec endpoints not on disk -> available
  if (specGroup) {
    const diskNames = new Set(diskGroup?.endpoints ?? []);
    for (const ep of specGroup.endpoints) {
      if (diskNames.has(ep.name)) continue;
      endpoints.push({
        group: groupName,
        name: ep.name,
        httpMethod: ep.httpMethod,
        path: ep.path,
        status: "available",
      });
    }
  }

  return endpoints;
}
