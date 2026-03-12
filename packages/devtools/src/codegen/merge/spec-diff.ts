/**
 * Spec diff engine — orchestrates endpoint, schema, and breaking change diffing.
 *
 * Accepts either a full ParsedSpec or a lightweight SpecDigest.
 * When given a ParsedSpec, converts to digest first for uniform comparison.
 */

import { classifyBreakingChanges } from "./classify-breaking";
import { diffEndpoints } from "./diff-endpoints";
import { diffSchemas } from "./diff-schemas";
import { createSpecDigest } from "./spec-digest";
import type { DiffableSpec, SpecDiff, SpecDigest } from "./types";

/** Type guard — checks the `_kind` discriminant set by createSpecDigest */
function isDigest(spec: DiffableSpec): spec is SpecDigest {
  return "_kind" in spec && spec._kind === "digest";
}

function toDigest(spec: DiffableSpec): SpecDigest {
  return isDigest(spec) ? spec : createSpecDigest(spec);
}

export function diffSpecs(oldSpec: DiffableSpec, newSpec: DiffableSpec): SpecDiff {
  const oldDigest = toDigest(oldSpec);
  const newDigest = toDigest(newSpec);

  const endpointDiff = diffEndpoints(oldDigest.groups, newDigest.groups);
  const schemaChanges = diffSchemas(oldDigest.schemas, newDigest.schemas);
  const breakingChanges = classifyBreakingChanges(endpointDiff, schemaChanges);

  return { ...endpointDiff, schemaChanges, breakingChanges };
}
