/**
 * Classifies endpoints within a group by cross-referencing spec and disk data.
 */

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
): InventoryEndpoint[] {
  const endpoints: InventoryEndpoint[] = [];

  // Disk endpoints: classify against spec + fingerprints
  if (diskGroup) {
    for (const ep of diskGroup.endpoints) {
      endpoints.push(
        classifyDiskEndpoint(
          groupName,
          ep.name,
          ep.httpMethod,
          ep.path,
          specGroup,
          fingerprints,
          diskHashes,
        ),
      );
    }
  }

  // Spec endpoints not on disk -> available
  if (specGroup) {
    const diskNames = new Set(diskGroup?.endpoints.map((e) => e.name) ?? []);
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
