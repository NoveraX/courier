/**
 * Spec hashing and change detection.
 */

import { createHash } from "node:crypto";
import type { ParsedSpec } from "../parser/types";

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

