/**
 * Merge preview and orphan cleanup helpers for write flow.
 */

import type { CourierImportEntry } from "@noverax/courier/config";
import type { ParsedSpec } from "../apis";
import { createSpecDigest } from "../apis";
import type { ImportStateEntry } from "../apis/imports-state";
import { previewUpdate } from "../apis/merge/update-flow";
import type { UpdateResult } from "../apis/registry/types";
import { resolveProjectSafe } from "../context";
import { cleanupOrphanFiles } from "./cleanup-orphans";
import { getEffectiveImportDir, persistImportState } from "./imports-bridge";
import {
  buildFallbackFingerprints,
  collectFingerprints,
  readFilesFromDisk,
} from "./registry-helpers";
import type { WriteBody } from "./write-types";

export function computeMergePreview(
  files: WriteBody["files"],
  state: ImportStateEntry | undefined,
): UpdateResult {
  const existingFiles = readFilesFromDisk(files.map((f) => f.path));
  const cached = state?.fileFingerprints ?? {};
  const fingerprints =
    Object.keys(cached).length > 0
      ? cached
      : buildFallbackFingerprints(existingFiles, state?.userModified ?? []);

  return previewUpdate(fingerprints, files, existingFiles);
}

export function removeOrphanFiles(
  files: WriteBody["files"],
  entry: CourierImportEntry,
  name: string,
): number {
  const newPaths = new Set(files.map((f) => resolveProjectSafe(f.path)));
  return cleanupOrphanFiles(getEffectiveImportDir(entry, name), newPaths);
}

export async function persistRawSource(
  files: WriteBody["files"],
  sourceName: string,
  spec: ParsedSpec,
  prevState: ImportStateEntry | undefined,
): Promise<void> {
  const newFingerprints = collectFingerprints(files);
  if (Object.keys(newFingerprints).length === 0) return;
  const now = new Date().toISOString();
  await persistImportState(sourceName, {
    specHash: prevState?.specHash ?? "",
    digest: createSpecDigest(spec),
    fetchedAt: prevState?.fetchedAt ?? now,
    lastSyncedAt: now,
    userModified: prevState?.userModified ?? [],
    generatedFiles: files.map((f) => f.path),
    fileFingerprints: newFingerprints,
  });
}
