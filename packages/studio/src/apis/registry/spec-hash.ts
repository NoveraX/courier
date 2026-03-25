/**
 * Spec hashing and update detection for registry sources.
 */

import { createHash } from "node:crypto";
import type { ParsedSpec } from "../parser/types";
import type { RegistryConfig, RegistrySource } from "./types";

/** Compute a hash of the spec for change detection. */
export function computeSpecHash(spec: ParsedSpec): string {
  const content = JSON.stringify({
    title: spec.title,
    version: spec.version,
    groups: spec.groups,
    schemas: spec.schemas,
    securitySchemes: spec.securitySchemes,
  });
  return createHash("sha256").update(content).digest("hex").slice(0, 32);
}

/** Check if a new spec differs from the stored version. */
export function hasSpecChanged(source: RegistrySource, newSpec: ParsedSpec): boolean {
  return computeSpecHash(newSpec) !== source.specHash;
}

/** Update specHash and userModified for a source after re-generation. */
export function updateSource(
  config: RegistryConfig,
  name: string,
  specHash: string,
  userModified: string[] = [],
): RegistryConfig {
  const source = config.sources[name];
  if (!source) return config;

  return {
    ...config,
    sources: {
      ...config.sources,
      [name]: { ...source, specHash, userModified },
    },
  };
}
