/**
 * Classification logic for individual endpoints during inventory build.
 */

import type { EndpointStatus, InventoryEndpoint, ModificationStatus } from "./types";

interface SpecGroupInfo {
  prefix: string;
  endpoints: Array<{ name: string; httpMethod: string; path: string }>;
}

/**
 * Classify a single disk endpoint against spec and fingerprints.
 *
 * `httpMethod`/`path` are looked up from the matching spec entry when present
 * — disk listings only carry endpoint names, and spec data is the canonical
 * source for HTTP method + path of any endpoint that still exists upstream.
 * Endpoints with no matching spec entry (custom or removed-from-spec) get
 * empty strings; UI consumers degrade gracefully on those rows.
 */
export function classifyDiskEndpoint(
  group: string,
  name: string,
  specGroup: SpecGroupInfo | undefined,
  fingerprints: Record<string, string>,
  diskHashes: Record<string, string>,
): InventoryEndpoint {
  const specEntry = specGroup?.endpoints.find((e) => e.name === name);
  const inSpec = !!specEntry;
  const storedHash = fingerprints[name];
  const diskHash = diskHashes[name];

  const { status, modificationStatus } = resolveStatus(inSpec, storedHash, diskHash);
  return {
    group,
    name,
    httpMethod: specEntry?.httpMethod ?? "",
    path: specEntry?.path ?? "",
    status,
    modificationStatus,
  };
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
