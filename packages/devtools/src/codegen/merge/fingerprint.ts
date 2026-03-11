/**
 * Fingerprint classification and generation for tracking user modifications.
 */

import { extractEndpoints } from "./extract-endpoints";
import { computeHash } from "./hash";
import type { EndpointFingerprint, EndpointStatus, FingerprintResult } from "./types";

/**
 * Compare extracted endpoints against stored fingerprints and new spec names.
 *
 * Classification:
 * - `safe`: hash matches stored → safe to overwrite
 * - `modified`: hash differs → user edited, needs merge
 * - `new`: in spec but not in file → add it
 * - `removed`: in file but not in spec → user decides
 */
export function classifyEndpoints(
  existingCode: Record<string, string>,
  storedFingerprints: Record<string, EndpointFingerprint>,
  newSpecEndpoints: string[],
): FingerprintResult {
  const endpoints: Record<string, EndpointStatus> = {};
  const newSpecSet = new Set(newSpecEndpoints);
  const existingNames = new Set(Object.keys(existingCode));

  for (const name of existingNames) {
    endpoints[name] = classifySingle(name, existingCode, storedFingerprints, newSpecSet);
  }

  for (const name of newSpecEndpoints) {
    if (!existingNames.has(name)) endpoints[name] = "new";
  }

  return { endpoints, existingCode };
}

function classifySingle(
  name: string,
  existingCode: Record<string, string>,
  storedFingerprints: Record<string, EndpointFingerprint>,
  newSpecSet: Set<string>,
): EndpointStatus {
  const stored = storedFingerprints[name];
  if (!stored) return "modified";

  const currentHash = computeHash(existingCode[name] ?? "");
  if (currentHash !== stored.hash) {
    return newSpecSet.has(name) ? "modified" : "removed";
  }
  return newSpecSet.has(name) ? "safe" : "removed";
}

/**
 * Generate fingerprints for all endpoints in generated code.
 * Call after code generation to store hashes for future comparison.
 */
export function generateFingerprints(
  generatedContent: string,
): Record<string, EndpointFingerprint> {
  const endpoints = extractEndpoints(generatedContent);
  const fingerprints: Record<string, EndpointFingerprint> = {};

  for (const [name, code] of Object.entries(endpoints)) {
    fingerprints[name] = { hash: computeHash(code), userModified: false };
  }

  return fingerprints;
}
