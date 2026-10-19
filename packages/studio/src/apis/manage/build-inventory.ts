/**
 * Builds an endpoint inventory by cross-referencing spec, disk, and fingerprints.
 *
 * Pure function — no I/O, no side effects.
 */

import type { ParsedSpec } from "../parser/types";

import { buildGroupEndpoints } from "./inventory-classifier";
import {
  buildDiskMap,
  buildSpecMap,
  type DiskGroupInfo,
  endpointHashes,
  endpointRoutes,
  type SpecGroupInfo,
} from "./inventory-indexers";
import { pairedGroups } from "./paired-groups";
import type {
  DiskGroupListing,
  EndpointInventory,
  InventoryEndpoint,
  InventoryGroup,
} from "./types";

export function buildEndpointInventory(
  spec: ParsedSpec,
  diskGroups: DiskGroupListing[],
  fingerprints: Record<string, Record<string, string>>,
  existingFiles: Record<string, string>,
): EndpointInventory {
  const specMap = buildSpecMap(spec.groups);
  const diskMap = buildDiskMap(diskGroups);
  /* A group renamed is read as the group it is now, its endpoints the same ones. */
  const diskOf = pairedGroups(specMap, diskMap);
  const paired = new Set(diskOf.values());
  const unpaired = new Set([...diskMap.keys()].filter((name) => !paired.has(name)));
  /* Each group is compared with what Studio recorded for its own file. */
  const listed = (
    groupName: string,
    specGroup: SpecGroupInfo | undefined,
    diskGroup: DiskGroupInfo | undefined,
  ): InventoryEndpoint[] => {
    const file = diskGroup?.file;
    return buildGroupEndpoints(
      groupName,
      specGroup,
      diskGroup,
      file === undefined ? {} : (fingerprints[file] ?? {}),
      file === undefined ? {} : endpointHashes(existingFiles[file]),
      file === undefined ? {} : endpointRoutes(existingFiles[file]),
    );
  };

  const groups: InventoryGroup[] = [];
  let totalActive = 0;
  let totalAvailable = 0;
  let totalCustom = 0;

  for (const groupName of new Set([...specMap.keys(), ...unpaired])) {
    const specGroup = specMap.get(groupName);
    const own = specGroup === undefined ? groupName : diskOf.get(groupName);
    const diskGroup = own === undefined ? undefined : diskMap.get(own);
    /* What the file under the group's name still holds, another group's endpoints, goes from it. */
    const leftUnder =
      own !== groupName && unpaired.has(groupName) ? diskMap.get(groupName) : undefined;
    const endpoints = [
      ...listed(groupName, specGroup, diskGroup),
      ...(leftUnder === undefined
        ? []
        : listed(groupName, specGroup, leftUnder).filter((e) => e.status !== "available")),
    ];
    const isCustomGroup = endpoints.length > 0 && endpoints.every((e) => e.status === "custom");

    groups.push({
      name: groupName,
      prefix: specGroup?.prefix ?? diskGroup?.prefix ?? leftUnder?.prefix ?? "",
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
