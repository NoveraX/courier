/**
 * Builds an endpoint inventory by cross-referencing spec, disk, and fingerprints.
 *
 * Pure function — no I/O, no side effects.
 */

import { extractEndpoints } from "../merge/extract-endpoints";
import { computeHash } from "../merge/hash";
import type { ParsedGroup, ParsedSpec } from "../parser/types";
import type { ScannedGroup } from "../scanner/types";

import { classifyDiskEndpoint } from "./classify-endpoint";
import type { EndpointInventory, InventoryEndpoint, InventoryGroup } from "./types";

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

// ── Helpers ──────────────────────────────────────────────────────────────────

interface SpecGroupInfo {
  prefix: string;
  endpoints: Array<{ name: string; httpMethod: string; path: string }>;
}

function buildSpecMap(groups: ParsedGroup[]): Map<string, SpecGroupInfo> {
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

function buildDiskMap(
  groups: ScannedGroup[],
): Map<
  string,
  { prefix: string; endpoints: Array<{ name: string; httpMethod: string; path: string }> }
> {
  const map = new Map<
    string,
    { prefix: string; endpoints: Array<{ name: string; httpMethod: string; path: string }> }
  >();
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

function buildDiskHashes(existingFiles: Record<string, string>): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const content of Object.values(existingFiles)) {
    const eps = extractEndpoints(content);
    for (const [name, code] of Object.entries(eps)) {
      hashes[name] = computeHash(code);
    }
  }
  return hashes;
}

function buildGroupEndpoints(
  groupName: string,
  specGroup: SpecGroupInfo | undefined,
  diskGroup:
    | { prefix: string; endpoints: Array<{ name: string; httpMethod: string; path: string }> }
    | undefined,
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

  // Spec endpoints not on disk → available
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
