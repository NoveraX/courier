/**
 * Fingerprint classification and generation for tracking user modifications.
 */

import { ownValue } from "../own-value";
import { extractEndpoints } from "./extract-endpoints";
import { computeHash } from "./hash";
import type { EndpointStatus, FingerprintResult } from "./types";

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
  storedFingerprints: Record<string, string>,
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
  storedFingerprints: Record<string, string>,
  newSpecSet: Set<string>,
): EndpointStatus {
  const storedHash = ownValue(storedFingerprints, name);
  if (!storedHash) return "modified";

  const currentHash = computeHash(ownValue(existingCode, name) ?? "");
  if (currentHash !== storedHash) {
    return newSpecSet.has(name) ? "modified" : "removed";
  }
  return newSpecSet.has(name) ? "safe" : "removed";
}

/**
 * Generate compact fingerprints for all endpoints in generated code.
 *
 * @returns Endpoint name → code hash map
 */
export function generateFingerprints(generatedContent: string): Record<string, string> {
  const endpoints = extractEndpoints(generatedContent);
  const fingerprints: Record<string, string> = {};

  for (const [name, code] of Object.entries(endpoints)) {
    fingerprints[name] = computeHash(code);
  }

  return fingerprints;
}
