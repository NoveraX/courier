import type { ParsedSpec } from "../apis";
import { computeSpecHash, createSpecDigest } from "../apis";
import type { ImportStateEntry } from "../apis/imports-state";
import type { AddResult, RemoveResult } from "../apis/manage/types";
import { persistImportState } from "./imports-bridge";
import type { ManagePreviewResponse } from "./manage-helpers";

/**
 * Record in the imports state what adding and removing endpoints wrote: the
 * spec it was applied from, the endpoint fingerprints that are the baseline
 * for detecting the user's edits, and the files Studio now owns.
 *
 * @param name - The import
 * @param spec - The spec the endpoints were taken from
 * @param prevState - The import's state the preview was computed from
 * @param applied - The preview that was written
 *
 * @example
 * ```ts
 * await persistManageApplyState("pets", spec, getImportState(imports, "pets"), preview);
 * ```
 */
export async function persistManageApplyState(
  name: string,
  spec: ParsedSpec,
  prevState: ImportStateEntry | undefined,
  { addResult, removeResult }: ManagePreviewResponse,
): Promise<void> {
  /* fileFingerprints is keyed by ENDPOINT NAME (from generateFingerprints).
   * generatedFiles is a list of FILE PATHS Studio has written — they are
   * two different axes and must be tracked independently. */
  const mergedFps: Record<string, string> = { ...(prevState?.fileFingerprints ?? {}) };
  if (addResult) Object.assign(mergedFps, addResult.newFingerprints);
  if (removeResult) {
    for (const endpoint of removeResult.removedFingerprints) {
      delete mergedFps[endpoint];
    }
  }

  const generatedFiles = mergeGeneratedFilePaths(
    prevState?.generatedFiles ?? [],
    addResult,
    removeResult,
  );

  const now = new Date().toISOString();
  await persistImportState(name, {
    specHash: computeSpecHash(spec),
    digest: createSpecDigest(spec),
    fetchedAt: prevState?.fetchedAt ?? now,
    lastSyncedAt: now,
    userModified: prevState?.userModified ?? [],
    generatedFiles,
    fileFingerprints: mergedFps,
  });
}

function mergeGeneratedFilePaths(
  previous: string[],
  addResult: AddResult | undefined,
  removeResult: RemoveResult | undefined,
): string[] {
  const paths = new Set(previous);
  if (addResult) {
    for (const f of addResult.files) paths.add(f.path);
    if (addResult.sourceFileUpdate) paths.add(addResult.sourceFileUpdate.path);
  }
  if (removeResult) {
    for (const f of removeResult.modifiedFiles) paths.add(f.path);
    if (removeResult.sourceFileUpdate) paths.add(removeResult.sourceFileUpdate.path);
    for (const deleted of removeResult.deletedFiles) paths.delete(deleted);
  }
  return Array.from(paths);
}
