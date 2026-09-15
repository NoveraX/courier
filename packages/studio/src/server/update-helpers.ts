/**
 * Helpers for update flow routes — preview and apply logic.
 */

import type { ParsedSpec } from "../apis";
import { computeSpecHash, createSpecDigest, diffSpecs, generateCode } from "../apis";
import type { ImportStateEntry } from "../apis/imports-state";
import type { BreakingChange, MergeChange, SpecDiff } from "../apis/merge/types";
import { previewUpdate } from "../apis/merge/update-flow";
import { resolveProjectSafe } from "../context";
import { cleanupOrphanFiles } from "./cleanup-orphans";
import {
  getEffectiveImportDir,
  getImportEntry,
  getImportState,
  loadImportsSnapshot,
  persistImportState,
} from "./imports-bridge";
import {
  buildFallbackFingerprints,
  collectFingerprints,
  detectUserModified,
  readFilesFromDisk,
  writeFileWithDirs,
} from "./registry-helpers";
import { scanTsFiles } from "./scan-ts-files";

interface PreviewRequest {
  name: string;
  newSpec: ParsedSpec;
}

interface ApplyRequest {
  name: string;
  newSpec: ParsedSpec;
  files: { path: string; content: string }[];
}

interface PreviewResponse {
  files: { path: string; content: string; status: string; changes: MergeChange[] }[];
  deletedFiles?: string[];
  breakingChanges: BreakingChange[];
  specDiff?: SpecDiff;
}

/** Compute a preview of what an update would change */
export async function handlePreviewUpdate(
  body: PreviewRequest,
): Promise<PreviewResponse | { error: string; status: number }> {
  const snapshot = await loadImportsSnapshot();
  const entry = getImportEntry(snapshot, body.name);
  if (!entry) return { error: `Source "${body.name}" not found`, status: 404 };
  const state = getImportState(snapshot, body.name);

  const generated = generateCode(body.newSpec, { ...entry, selectedEndpoints: null });
  const diskPaths = scanTsFiles(entry, body.name, generated);
  const existingFiles = readFilesFromDisk(diskPaths);
  const fingerprints = loadFingerprints(existingFiles, state);
  const result = previewUpdate(fingerprints, generated, existingFiles);

  const specDiff = computeSpecDiff(state, body.newSpec);

  return {
    ...result,
    breakingChanges: specDiff?.breakingChanges ?? [],
    specDiff,
  };
}

/** Apply a previewed update — write files and update state */
export async function handleApplyUpdate(
  body: ApplyRequest,
): Promise<
  { success: boolean; written: number; deleted: number } | { error: string; status: number }
> {
  const snapshot = await loadImportsSnapshot();
  const entry = getImportEntry(snapshot, body.name);
  if (!entry) return { error: `Source "${body.name}" not found`, status: 404 };
  const prevState = getImportState(snapshot, body.name);

  /* Detect user-modified endpoints BEFORE overwriting — compare the disk
   * state of the files the user just approved against the fingerprints
   * Studio recorded after the previous sync. Any divergence is an edit
   * the user made after the preview was generated. */
  const prevFingerprints = prevState?.fileFingerprints ?? {};
  const preWriteDisk = readFilesFromDisk(body.files.map((f) => f.path));
  const userModified = detectUserModified(prevFingerprints, preWriteDisk);

  writeUpdateFiles(body.files);

  const generated = generateCode(body.newSpec, { ...entry, selectedEndpoints: null });
  const deleted = cleanupOrphanFiles(
    getEffectiveImportDir(entry, body.name),
    new Set(generated.map((f) => resolveProjectSafe(f.path))),
  );

  /* Recompute fingerprints from the files now on disk — they become the
   * baseline for the next sync's edit detection. */
  const newFingerprints = collectFingerprints(body.files);
  await persistUpdateState(body, prevState, newFingerprints, userModified);

  return { success: true, written: body.files.length, deleted };
}

function writeUpdateFiles(files: { path: string; content: string }[]): void {
  for (const file of files) {
    writeFileWithDirs(resolveProjectSafe(file.path), file.content);
  }
}

async function persistUpdateState(
  body: ApplyRequest,
  prevState: ImportStateEntry | undefined,
  fingerprints: Record<string, string>,
  userModified: string[],
): Promise<void> {
  const now = new Date().toISOString();

  await persistImportState(body.name, {
    specHash: computeSpecHash(body.newSpec),
    digest: createSpecDigest(body.newSpec),
    fetchedAt: prevState?.fetchedAt ?? now,
    lastSyncedAt: now,
    userModified,
    generatedFiles: body.files.map((f) => f.path),
    fileFingerprints: fingerprints,
  });
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function loadFingerprints(
  existingFiles: Record<string, string>,
  state: ImportStateEntry | undefined,
): Record<string, string> {
  const cached = state?.fileFingerprints ?? {};
  return Object.keys(cached).length > 0
    ? cached
    : buildFallbackFingerprints(existingFiles, state?.userModified ?? []);
}

function computeSpecDiff(
  state: ImportStateEntry | undefined,
  newSpec: ParsedSpec,
): SpecDiff | undefined {
  const oldDigest = state?.digest;
  return oldDigest ? diffSpecs(oldDigest, createSpecDigest(newSpec)) : undefined;
}
