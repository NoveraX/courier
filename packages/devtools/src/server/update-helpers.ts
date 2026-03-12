/**
 * Helpers for update flow routes — preview and apply logic.
 */

import type { ParsedSpec } from "../codegen";
import {
  computeSpecHash,
  createSpecDigest,
  diffSpecs,
  generateCode,
  getCachedDigest,
  getCachedFingerprints,
  getSource,
  loadCache,
  loadDigestCache,
  loadRegistry,
  saveRegistry,
  updateSource,
} from "../codegen";
import type { BreakingChange, MergeChange, SpecDiff } from "../codegen/merge/types";
import { previewUpdate } from "../codegen/merge/update-flow";
import type { RegistryConfig } from "../codegen/registry/types";
import { resolveProjectSafe } from "../context";
import { cleanupOrphanFiles } from "./cleanup-orphans";
import { getEffectiveDir } from "./fs-helpers";
import {
  buildFallbackFingerprints,
  collectFingerprints,
  detectUserModified,
  persistCaches,
  readFilesFromDisk,
  writeFileWithDirs,
} from "./registry-helpers";
import { scanTsFiles } from "./scan-ts-files";

interface PreviewRequest {
  name: string;
  newSpec: ParsedSpec;
  configPath?: string;
}

interface ApplyRequest {
  name: string;
  newSpec: ParsedSpec;
  files: { path: string; content: string }[];
  configPath?: string;
}

interface PreviewResponse {
  files: { path: string; content: string; status: string; changes: MergeChange[] }[];
  deletedFiles?: string[];
  breakingChanges: BreakingChange[];
  specDiff?: SpecDiff;
}

/** Compute a preview of what an update would change */
export function handlePreviewUpdate(
  body: PreviewRequest,
): PreviewResponse | { error: string; status: number } {
  const config = loadRegistry(body.configPath);
  const source = getSource(config, body.name);
  if (!source) return { error: `Source "${body.name}" not found`, status: 404 };

  const generated = generateCode(body.newSpec, source.options);
  const diskPaths = scanTsFiles(source, generated);
  const existingFiles = readFilesFromDisk(diskPaths);
  const fingerprints = loadFingerprints(body.name, existingFiles, source);
  const result = previewUpdate(fingerprints, generated, existingFiles);

  const specDiff = computeSpecDiff(body.name, body.newSpec);

  return {
    ...result,
    breakingChanges: specDiff?.breakingChanges ?? [],
    specDiff,
  };
}

/** Apply a previewed update — write files and update caches */
export function handleApplyUpdate(
  body: ApplyRequest,
): { success: boolean; written: number; deleted: number } | { error: string; status: number } {
  let config = loadRegistry(body.configPath);
  const source = getSource(config, body.name);
  if (!source) return { error: `Source "${body.name}" not found`, status: 404 };

  writeUpdateFiles(body.files);

  const generated = generateCode(body.newSpec, source.options);
  const newFingerprints = collectFingerprints(generated);
  const deleted = cleanupOrphanFiles(
    getEffectiveDir(source.outputDir, source.options.sourceName),
    new Set(generated.map((f) => resolveProjectSafe(f.path))),
  );

  persistCaches(body.name, newFingerprints, body.newSpec);
  config = buildUpdateState(config, body, newFingerprints);
  saveRegistry(config, body.configPath);

  return { success: true, written: body.files.length, deleted };
}

function writeUpdateFiles(files: { path: string; content: string }[]): void {
  for (const file of files) {
    writeFileWithDirs(resolveProjectSafe(file.path), file.content);
  }
}

function buildUpdateState(
  config: RegistryConfig,
  body: ApplyRequest,
  fingerprints: Record<string, string>,
): RegistryConfig {
  const mergedFiles: Record<string, string> = {};
  for (const f of body.files) mergedFiles[f.path] = f.content;

  const userModified = detectUserModified(fingerprints, mergedFiles);
  return updateSource(
    config,
    body.name,
    computeSpecHash(body.newSpec),
    Object.keys(fingerprints).length,
    userModified,
  );
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function loadFingerprints(
  name: string,
  existingFiles: Record<string, string>,
  source: NonNullable<ReturnType<typeof getSource>>,
): Record<string, string> {
  const cache = loadCache();
  const cached = getCachedFingerprints(cache, name);
  return Object.keys(cached).length > 0
    ? cached
    : buildFallbackFingerprints(existingFiles, source.userModified);
}

function computeSpecDiff(name: string, newSpec: ParsedSpec) {
  const digestCache = loadDigestCache();
  const oldDigest = getCachedDigest(digestCache, name);
  return oldDigest ? diffSpecs(oldDigest, createSpecDigest(newSpec)) : undefined;
}
