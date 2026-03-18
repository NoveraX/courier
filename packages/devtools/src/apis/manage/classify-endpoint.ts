/**
 * Classification logic for individual endpoints during inventory build.
 */

import type { EndpointStatus, InventoryEndpoint, ModificationStatus } from "./types";

interface SpecGroupInfo {
  prefix: string;
  endpoints: Array<{ name: string; httpMethod: string; path: string }>;
}

/** Classify a single disk endpoint against spec and fingerprints */
export function classifyDiskEndpoint(
  group: string,
  name: string,
  httpMethod: string,
  path: string,
  specGroup: SpecGroupInfo | undefined,
  fingerprints: Record<string, string>,
  diskHashes: Record<string, string>,
): InventoryEndpoint {
  const inSpec = specGroup?.endpoints.some((e) => e.name === name) ?? false;
  const storedHash = fingerprints[name];
  const diskHash = diskHashes[name];

  const { status, modificationStatus } = resolveStatus(inSpec, storedHash, diskHash);
  return { group, name, httpMethod, path, status, modificationStatus };
}

function resolveStatus(
  inSpec: boolean,
  storedHash: string | undefined,
  diskHash: string | undefined,
): { status: EndpointStatus; modificationStatus?: ModificationStatus } {
  if (inSpec) {
    const mod: ModificationStatus =
      storedHash && diskHash && storedHash === diskHash ? "safe" : "modified";
    return { status: "active", modificationStatus: mod };
  }

  // Not in spec — check if it was ever generated (has fingerprint)
  if (storedHash) return { status: "removed-from-spec" };
  return { status: "custom" };
}
