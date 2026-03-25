/**
 * Builds an endpoint inventory by cross-referencing spec, disk, and fingerprints.
 *
 * Pure function — no I/O, no side effects.
 */

import type { ParsedSpec } from "../parser/types";
import type { ScannedGroup } from "../scanner/types";

import { buildGroupEndpoints } from "./inventory-classifier";
import { buildDiskHashes, buildDiskMap, buildSpecMap } from "./inventory-indexers";
import type { EndpointInventory, InventoryGroup } from "./types";

export function buildEndpointInventory(
  spec: ParsedSpec,
  diskGroups: ScannedGroup[],
  fingerprints: Record<string, string>,
  existingFiles: Record<string, string>,
): EndpointInventory {
  const specMap = buildSpecMap(spec.groups);
  const diskMap = buildDiskMap(diskGroups);
  const diskHashes = buildDiskHashes(existingFiles);

  const allGroupNames = new Set([...specMap.keys(), ...diskMap.keys()]);
  const groups: InventoryGroup[] = [];
  let totalActive = 0;
  let totalAvailable = 0;
  let totalCustom = 0;

  for (const groupName of allGroupNames) {
    const specGroup = specMap.get(groupName);
    const diskGroup = diskMap.get(groupName);
    const endpoints = buildGroupEndpoints(
      groupName,
      specGroup,
      diskGroup,
      fingerprints,
      diskHashes,
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
