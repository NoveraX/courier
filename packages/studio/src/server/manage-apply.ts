/**
 * Apply logic for manage routes — writes files to disk and updates state.
 */

import { unlinkSync } from "node:fs";

import type { ParsedSpec } from "../apis";
import { computeSpecHash, createSpecDigest } from "../apis";
import type { ImportStateEntry } from "../apis/imports-state";
import type { AddResult, RemoveResult } from "../apis/manage/types";
import { resolveProjectSafe } from "../context";
import { getImportEntry, getImportState, loadImportsSnapshot, persistImportState } from "./imports-bridge";
import { handleManagePreview } from "./manage-helpers";
import { writeFileWithDirs } from "./registry-helpers";

interface ManageApplyRequest {
  name: string;
  spec: ParsedSpec;
  toAdd: Record<string, string[]>;
  toRemove: Record<string, string[]>;
}

export async function handleManageApply(
  body: ManageApplyRequest,
): Promise<{ success: true; written: number; deleted: number } | { error: string; status: number }> {
  const snapshot = await loadImportsSnapshot();
  const entry = getImportEntry(snapshot, body.name);
  if (!entry) return { error: `Source "${body.name}" not found`, status: 404 };
  const prevState = getImportState(snapshot, body.name);

  const preview = await handleManagePreview(body);
  if ("error" in preview) return preview;

  const { addResult, removeResult } = preview;
  const written = writeAddedFiles(addResult) + writeModifiedFiles(removeResult);
  const deleted = deleteRemovedFiles(removeResult);

  await updateImportStateAfterApply(body, prevState, addResult, removeResult);
  return { success: true, written, deleted };
}

// ── File operations ──────────────────────────────────────────────────────────

function writeAddedFiles(addResult?: AddResult): number {
  if (!addResult) return 0;
  let count = 0;

  for (const file of addResult.files) {
    writeFileWithDirs(resolveProjectSafe(file.path), file.content);
    count++;
  }
  if (addResult.sourceFileUpdate) {
    writeFileWithDirs(
      resolveProjectSafe(addResult.sourceFileUpdate.path),
      addResult.sourceFileUpdate.content,
    );
    count++;
  }

  return count;
}

function writeModifiedFiles(removeResult?: RemoveResult): number {
  if (!removeResult) return 0;
  let count = 0;

  for (const file of removeResult.modifiedFiles) {
    writeFileWithDirs(resolveProjectSafe(file.path), file.content);
    count++;
  }
  if (removeResult.sourceFileUpdate) {
    writeFileWithDirs(
      resolveProjectSafe(removeResult.sourceFileUpdate.path),
      removeResult.sourceFileUpdate.content,
    );
    count++;
  }

  return count;
}

function deleteRemovedFiles(removeResult?: RemoveResult): number {
  if (!removeResult) return 0;

  for (const filePath of removeResult.deletedFiles) {
    try {
      unlinkSync(resolveProjectSafe(filePath));
    } catch {
      /* already deleted */
    }
  }

  return removeResult.deletedFiles.length;
}

// ── State update ─────────────────────────────────────────────────────────────

async function updateImportStateAfterApply(
  body: ManageApplyRequest,
  prevState: ImportStateEntry | undefined,
  addResult?: AddResult,
  removeResult?: RemoveResult,
): Promise<void> {
  /* fileFingerprints is keyed by ENDPOINT NAME (from generateFingerprints).
   * generatedFiles is a list of FILE PATHS Studio has written — they are
   * two different axes and must be tracked independently. */
  const mergedFps: Record<string, string> = { ...(prevState?.fileFingerprints ?? {}) };
  if (addResult) Object.assign(mergedFps, addResult.newFingerprints);
  if (removeResult) {
    for (const name of removeResult.removedFingerprints) {
      delete mergedFps[name];
    }
  }

  const generatedFiles = mergeGeneratedFilePaths(
    prevState?.generatedFiles ?? [],
    addResult,
    removeResult,
  );

  const now = new Date().toISOString();
  await persistImportState(body.name, {
    specHash: computeSpecHash(body.spec),
    digest: createSpecDigest(body.spec),
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
