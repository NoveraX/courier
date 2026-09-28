/**
 * Update flow orchestration: preview spec updates with smart merge.
 * Pure function — no file I/O.
 */

import type { GeneratedFile } from "../generator/types";
import type { UpdateFileResult, UpdateResult } from "../registry/types";
import { declaresEndpoints } from "./declares-endpoints";
import { extractEndpoints } from "./extract-endpoints";
import { classifyEndpoints } from "./fingerprint";
import { mergeGroupFile } from "./merge-group";
import { readsAsDeclaration } from "./reads-as-declaration";

/**
 * Preview the result of updating a source to a new spec.
 *
 * A file that declares endpoints, a group or an API holding them inline, is
 * merged with the version on disk, so the edits made to it survive. Every
 * other file is generated whole from the spec and the options, and is
 * written as generated: that includes the source of an API grouped by tag
 * or path, whose `defineApi` lists its groups and holds no endpoint.
 *
 * A file on disk that does not read as code declaring endpoints — one saved
 * mid-edit — cannot be merged. It comes back as a `conflict` holding the
 * generated file, which replaces it only once the user allows that.
 *
 * @param fingerprints - Stored fingerprints for the source (endpoint name → hash)
 * @param generated - Freshly generated files from the new spec
 * @param existingFiles - Map of file path → content for files currently on disk
 * @returns Preview with merged files
 * @example
 * ```ts
 * previewUpdate(record.endpoints, [{ path, content: generated }], { [path]: onDisk }).files[0]?.status;
 * ```
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
  /* Both versions must declare endpoints: the merge keeps what surrounds
     them and takes the declaration from the generated file, so one that
     holds none, or an API that changed its shape, has nothing to merge. */
  if (!existing || !declaresEndpoints(existing) || !declaresEndpoints(gen.content)) {
    return { path: gen.path, content: gen.content, status: "safe", changes: [] };
  }
  if (!readsAsDeclaration(gen.path, existing)) return unmergeable(gen);

  const existingCode = extractEndpoints(existing);
  const specNames = Object.keys(extractEndpoints(gen.content));
  const fp = classifyEndpoints(existingCode, fingerprints, specNames);

  /* Always merge. Overwriting when no endpoint body had changed threw away
     everything else the file carried — the base it configures, imports the
     user added, helpers below the group — none of which the endpoint
     classification says anything about. */
  const result = mergeGroupFile(existing, gen.content, fp);
  if (!readsAsDeclaration(gen.path, result.content)) return unmergeable(gen);

  return {
    path: gen.path,
    content: result.content,
    status: result.status,
    changes: result.changes,
  };
}

/* The generated file, for a file on disk the merge cannot keep whole. */
function unmergeable(gen: GeneratedFile): UpdateFileResult {
  return {
    path: gen.path,
    content: gen.content,
    status: "conflict",
    changes: [
      {
        type: "updated",
        target: "file",
        detail: "Studio cannot read the file on disk as code, so it cannot keep its edits",
      },
    ],
  };
}
