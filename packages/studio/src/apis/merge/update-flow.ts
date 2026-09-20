/**
 * Update flow orchestration: preview spec updates with smart merge.
 * Pure function — no file I/O.
 */

import type { GeneratedFile } from "../generator/types";
import type { UpdateFileResult, UpdateResult } from "../registry/types";
import { extractEndpoints } from "./extract-endpoints";
import { classifyEndpoints } from "./fingerprint";
import { mergeGroupFile } from "./merge-group";

/** Either shape a generated source takes: a group, or a flat API. */
const SOURCE_MARKERS = ["defineGroup(", "defineApi("] as const;

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
  /* No existing file, or one that declares no source → safe overwrite */
  if (!existing || !SOURCE_MARKERS.some((marker) => existing.includes(marker))) {
    return { path: gen.path, content: gen.content, status: "safe", changes: [] };
  }

  const existingCode = extractEndpoints(existing);
  const specNames = Object.keys(extractEndpoints(gen.content));
  const fp = classifyEndpoints(existingCode, fingerprints, specNames);

  /* Always merge. Overwriting when no endpoint body had changed threw away
     everything else the file carried — the base it configures, imports the
     user added, helpers below the group — none of which the endpoint
     classification says anything about. */
  const result = mergeGroupFile(existing, gen.content, fp);

  return {
    path: gen.path,
    content: result.content,
    status: result.status,
    changes: result.changes,
  };
}
