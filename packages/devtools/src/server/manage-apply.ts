/**
 * Apply logic for manage routes — writes files to disk and updates caches.
 */

import { unlinkSync } from "node:fs";

import type { ParsedSpec } from "../apis";
import {
  computeSpecHash,
  getCachedFingerprints,
  getSource,
  loadCache,
  loadRegistry,
  saveRegistry,
  updateSource,
} from "../apis";
import type { AddResult, RemoveResult } from "../apis/manage/types";
import type { RegistrySource } from "../apis/registry/types";
import { resolveProjectSafe } from "../context";
import { handleManagePreview } from "./manage-helpers";
import { persistCaches, writeFileWithDirs } from "./registry-helpers";

interface ManageApplyRequest {
  name: string;
  spec: ParsedSpec;
  toAdd: Record<string, string[]>;
  toRemove: Record<string, string[]>;
  configPath?: string;
}

export function handleManageApply(
  body: ManageApplyRequest,
): { success: true; written: number; deleted: number } | { error: string; status: number } {
  const config = loadRegistry(body.configPath);
  const source = getSource(config, body.name);
  if (!source) return { error: `Source "${body.name}" not found`, status: 404 };

  const preview = handleManagePreview(body);
  if ("error" in preview) return preview;

  const { addResult, removeResult } = preview;
  const written = writeAddedFiles(addResult) + writeModifiedFiles(removeResult);
  const deleted = deleteRemovedFiles(removeResult);

  updateCachesAndRegistry(body, source, addResult, removeResult);
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

// ── Registry update ──────────────────────────────────────────────────────────

function updateCachesAndRegistry(
  body: ManageApplyRequest,
  source: RegistrySource,
  addResult?: AddResult,
  removeResult?: RemoveResult,
): void {
  const currentCache = loadCache();
  const currentFps = getCachedFingerprints(currentCache, body.name);
  const mergedFps = { ...currentFps };

  if (addResult) Object.assign(mergedFps, addResult.newFingerprints);
  if (removeResult) {
    for (const name of removeResult.removedFingerprints) {
      delete mergedFps[name];
    }
  }

  persistCaches(body.name, mergedFps, body.spec);

  let config = loadRegistry(body.configPath);
  config = updateSource(config, body.name, computeSpecHash(body.spec), source.userModified);
  saveRegistry(config, body.configPath);
}
