/**
 * Spec diff engine — orchestrates endpoint, schema, and breaking change diffing.
 */

import type { ParsedSpec } from "../parser/types";
import { classifyBreakingChanges } from "./classify-breaking";
import { diffEndpoints } from "./diff-endpoints";
import { diffSchemas } from "./diff-schemas";
import type { SpecDiff } from "./types";

export function diffSpecs(oldSpec: ParsedSpec, newSpec: ParsedSpec): SpecDiff {
  const endpointDiff = diffEndpoints(oldSpec.groups, newSpec.groups);
  const schemaChanges = diffSchemas(oldSpec.schemas, newSpec.schemas);
  const breakingChanges = classifyBreakingChanges(endpointDiff, schemaChanges);

  return { ...endpointDiff, schemaChanges, breakingChanges };
}
