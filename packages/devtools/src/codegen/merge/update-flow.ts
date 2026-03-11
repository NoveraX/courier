/**
 * Update flow orchestration: preview spec updates with smart merge.
 * Pure function — no file I/O.
 */

import type { GeneratedFile } from "../generator/types";
import type { ParsedSpec } from "../parser/types";
import { computeSpecHash } from "../registry";
import { extractEndpoints } from "./extract-endpoints";
import { classifyEndpoints, generateFingerprints } from "./fingerprint";
import { mergeGroupFile } from "./merge-group";
import { diffSpecs } from "./spec-diff";
import type { EndpointFingerprint, RegistrySource, UpdateFileResult, UpdateResult } from "./types";

const GROUP_MARKER = "defineGroup(";

/**
 * Preview the result of updating a source to a new spec.
 *
 * For each generated file, checks if an existing version has user modifications
 * and performs smart merge (new config + user body) when needed.
 *
 * @param source - Current registry entry for this source
 * @param newSpec - Newly parsed spec to update to
 * @param generated - Freshly generated files from the new spec
 * @param existingFiles - Map of file path → content for files currently on disk
 * @returns Full preview with merged files, breaking changes, and registry update
 */
export function previewUpdate(
  source: RegistrySource,
  newSpec: ParsedSpec,
  generated: GeneratedFile[],
  existingFiles: Record<string, string>,
): UpdateResult {
  const oldSpec = source.cachedSpec ?? newSpec;
  const diff = diffSpecs(oldSpec, newSpec);

  const files = generated.map((gen) => mergeOrOverwrite(gen, existingFiles[gen.path], source));

  return {
    files,
    breakingChanges: diff.breakingChanges,
    registryUpdate: buildUpdatedSource(source, newSpec, generated),
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mergeOrOverwrite(
  gen: GeneratedFile,
  existing: string | undefined,
  source: RegistrySource,
): UpdateFileResult {
  /* No existing file or non-group file → safe overwrite */
  if (!existing || !existing.includes(GROUP_MARKER)) {
    return { path: gen.path, content: gen.content, status: "safe", changes: [] };
  }

  const existingCode = extractEndpoints(existing);
  const specNames = Object.keys(extractEndpoints(gen.content));
  const fp = classifyEndpoints(existingCode, source.endpoints, specNames);
  const result = mergeGroupFile(existing, gen.content, fp);

  return {
    path: gen.path,
    content: result.content,
    status: result.status,
    changes: result.changes,
  };
}

function buildUpdatedSource(
  source: RegistrySource,
  newSpec: ParsedSpec,
  generated: GeneratedFile[],
): RegistrySource {
  return {
    ...source,
    specHash: computeSpecHash(newSpec),
    specVersion: newSpec.version,
    lastSynced: new Date().toISOString(),
    cachedSpec: newSpec,
    endpoints: collectGroupFingerprints(generated),
  };
}

function collectGroupFingerprints(generated: GeneratedFile[]): Record<string, EndpointFingerprint> {
  const result: Record<string, EndpointFingerprint> = {};
  for (const file of generated) {
    if (!file.content.includes(GROUP_MARKER)) continue;
    Object.assign(result, generateFingerprints(file.content));
  }
  return result;
}
