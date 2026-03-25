/**
 * Update flow orchestration: preview spec updates with smart merge.
 * Pure function — no file I/O.
 */

import type { GeneratedFile } from "../generator/types";
import type { UpdateFileResult, UpdateResult } from "../registry/types";
import { extractEndpoints } from "./extract-endpoints";
import { classifyEndpoints } from "./fingerprint";
import { mergeGroupFile } from "./merge-group";

const GROUP_MARKER = "defineGroup(";

/**
 * Preview the result of updating a source to a new spec.
 *
 * For each generated file, checks if an existing version has user modifications
 * and performs smart merge (new config + user body) when needed.
 *
 * @param fingerprints - Stored fingerprints for the source (endpoint name → hash)
 * @param generated - Freshly generated files from the new spec
 * @param existingFiles - Map of file path → content for files currently on disk
 * @returns Preview with merged files
 */
export function previewUpdate(
  fingerprints: Record<string, string>,
  generated: GeneratedFile[],
  existingFiles: Record<string, string>,
): UpdateResult {
  const files = generated.map((gen) =>
    mergeOrOverwrite(gen, existingFiles[gen.path], fingerprints),
  );

  /* Detect files on disk that are no longer in the generated set */
  const generatedPaths = new Set(generated.map((g) => g.path));
  const deletedFiles = Object.keys(existingFiles).filter((p) => !generatedPaths.has(p));

  return { files, deletedFiles, breakingChanges: [] };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mergeOrOverwrite(
  gen: GeneratedFile,
  existing: string | undefined,
  fingerprints: Record<string, string>,
): UpdateFileResult {
  /* No existing file or non-group file → safe overwrite */
  if (!existing || !existing.includes(GROUP_MARKER)) {
    return { path: gen.path, content: gen.content, status: "safe", changes: [] };
  }

  const existingCode = extractEndpoints(existing);
  const specNames = Object.keys(extractEndpoints(gen.content));
  const fp = classifyEndpoints(existingCode, fingerprints, specNames);

  /* If no endpoints were user-modified, overwrite entirely.
   * This ensures import changes (zod→arktype), naming convention
   * changes, and removed endpoints all apply cleanly. */
  const hasUserModifications = Object.values(fp.endpoints).some((s) => s === "modified");
  if (!hasUserModifications) {
    return { path: gen.path, content: gen.content, status: "safe", changes: [] };
  }

  const result = mergeGroupFile(existing, gen.content, fp);

  return {
    path: gen.path,
    content: result.content,
    status: result.status,
    changes: result.changes,
  };
}
