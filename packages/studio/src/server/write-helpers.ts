/**
 * Helpers for apis write routes — merge and raw write logic.
 */

import type { CourierImportEntry } from "@noverax/courier/config";
import { createSpecDigest, type ParsedSpec } from "../apis";
import type { ImportStateEntry } from "../apis/imports-state";
import { resolveImportLayout } from "../apis/layout";
import type { UpdateResult } from "../apis/registry/types";
import { resolveProjectSafe } from "../context";
import { persistImportState } from "./imports-bridge";
import { computeMergePreview, persistRawSource, removeOrphanFiles } from "./merge-preview";
import {
  collectFingerprints,
  detectUserModified,
  readFilesFromDisk,
  writeFileWithDirs,
} from "./registry-helpers";
import type { WriteBody, WriteResult } from "./write-types";

interface ImportContext {
  entry: CourierImportEntry | undefined;
  state: ImportStateEntry | undefined;
}

/** Merge write: preserves user edits via fingerprint diffing */
export async function handleMergeWrite(
  files: WriteBody["files"],
  sourceName: string,
  spec: ParsedSpec,
  ctx: ImportContext & { entry: CourierImportEntry },
): Promise<WriteResult> {
  /* The declaration can be refused; that has to happen before anything is written. */
  const layout = resolveImportLayout(ctx.entry, sourceName);
  const preview = computeMergePreview(files, ctx.state);

  /* Snapshot user-modified endpoints BEFORE overwriting disk. Compare the
   * current on-disk fingerprints of the files we're about to touch against
   * the fingerprints Studio recorded after the previous sync — any
   * divergence means the user hand-edited between syncs. */
  const prevFingerprints = ctx.state?.fileFingerprints ?? {};
  const preWriteDisk = readFilesFromDisk(preview.files.map((f) => f.path));
  const userModified = detectUserModified(prevFingerprints, preWriteDisk);

  for (const file of preview.files) {
    writeFileWithDirs(resolveProjectSafe(file.path), file.content);
  }

  const deleted = removeOrphanFiles(files, layout);
  const result = await finalizeImportState(preview, sourceName, spec, ctx.state, userModified);

  return { ...result, deleted };
}

/** Raw write: no merge, just write files to disk */
export async function handleRawWrite(
  files: WriteBody["files"],
  sourceName: string | undefined,
  spec: ParsedSpec | undefined,
  ctx: ImportContext,
): Promise<WriteResult> {
  for (const file of files) {
    writeFileWithDirs(resolveProjectSafe(file.path), file.content);
  }

  if (sourceName && spec) {
    await persistRawSource(files, sourceName, spec, ctx.state);
  }

  return {
    written: files.length,
    merged: 0,
    files: files.map((f) => ({ path: f.path, status: "safe" })),
  };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

async function finalizeImportState(
  preview: UpdateResult,
  sourceName: string,
  spec: ParsedSpec,
  prevState: ImportStateEntry | undefined,
  userModified: string[],
): Promise<WriteResult> {
  /* Recompute fingerprints from the just-written merged files — these
   * become the baseline for the next sync's user-modification detection. */
  const newFingerprints = collectFingerprints(preview.files);
  const now = new Date().toISOString();

  await persistImportState(sourceName, {
    specHash: prevState?.specHash ?? "",
    digest: createSpecDigest(spec),
    fetchedAt: prevState?.fetchedAt ?? now,
    lastSyncedAt: now,
    userModified,
    generatedFiles: preview.files.map((f) => f.path),
    fileFingerprints: newFingerprints,
  });

  const mergedCount = preview.files.filter((f) => f.status === "merged").length;
  return {
    written: preview.files.length,
    merged: mergedCount,
    files: preview.files.map((f) => ({ path: f.path, status: f.status })),
  };
}
