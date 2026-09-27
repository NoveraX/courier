/**
 * Builds an endpoint inventory by cross-referencing spec, disk, and fingerprints.
 *
 * Pure function — no I/O, no side effects.
 */

import type { ParsedSpec } from "../parser/types";

import { buildGroupEndpoints } from "./inventory-classifier";
import { buildDiskMap, buildSpecMap, endpointHashes } from "./inventory-indexers";
import type { DiskGroupListing, EndpointInventory, InventoryGroup } from "./types";

export function buildEndpointInventory(
  spec: ParsedSpec,
  diskGroups: DiskGroupListing[],
  fingerprints: Record<string, Record<string, string>>,
  existingFiles: Record<string, string>,
): EndpointInventory {
  const specMap = buildSpecMap(spec.groups);
  const diskMap = buildDiskMap(diskGroups);

  const allGroupNames = new Set([...specMap.keys(), ...diskMap.keys()]);
  const groups: InventoryGroup[] = [];
  let totalActive = 0;
  let totalAvailable = 0;
  let totalCustom = 0;

  for (const groupName of allGroupNames) {
    const specGroup = specMap.get(groupName);
    const diskGroup = diskMap.get(groupName);
    /* Each group is compared with what Studio recorded for its own file. */
    const file = diskGroup?.file;
    const endpoints = buildGroupEndpoints(
      groupName,
      specGroup,
      diskGroup,
      file === undefined ? {} : (fingerprints[file] ?? {}),
      file === undefined ? {} : endpointHashes(existingFiles[file]),
    );
    const isCustomGroup = endpoints.length > 0 && endpoints.every((e) => e.status === "custom");

    groups.push({
      name: groupName,
      prefix: specGroup?.prefix ?? diskGroup?.prefix ?? "",
      endpoints,
      isCustomGroup,
    });

    for (const ep of endpoints) {
      if (ep.status === "active") totalActive++;
      else if (ep.status === "available") totalAvailable++;
      else if (ep.status === "custom") totalCustom++;
    }
  }

  return { groups, specChanged: false, totalActive, totalAvailable, totalCustom };
}
