/**
 * Spec diff engine — orchestrates endpoint, schema, and breaking change diffing.
 *
 * Accepts either a full ParsedSpec or a lightweight SpecDigest for the old spec,
 * so the registry can store only the digest while still producing accurate diffs.
 */

import { classifyBreakingChanges } from "./classify-breaking";
import { diffEndpoints } from "./diff-endpoints";
import { diffSchemas } from "./diff-schemas";
import type { DigestGroup, DigestSchema, SpecDiff } from "./types";

/** Shape that both ParsedSpec and SpecDigest satisfy for diffing */
interface DiffableSpec {
  groups: DigestGroup[];
  schemas: Record<string, DigestSchema>;
}

export function diffSpecs(oldSpec: DiffableSpec, newSpec: DiffableSpec): SpecDiff {
  const endpointDiff = diffEndpoints(oldSpec.groups, newSpec.groups);
  const schemaChanges = diffSchemas(oldSpec.schemas, newSpec.schemas);
  const breakingChanges = classifyBreakingChanges(endpointDiff, schemaChanges);

  return { ...endpointDiff, schemaChanges, breakingChanges };
}
