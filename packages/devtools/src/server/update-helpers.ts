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
import { previewUpdate } from "../codegen/merge/update-flow";
import { resolveProjectSafe } from "../context";
import { cleanupOrphanFiles } from "./cleanup-orphans";
import {
  buildFallbackFingerprints,
  collectFingerprints,
  detectUserModified,
  persistCaches,
  readFilesFromDisk,
  writeFileSafe,
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
  files: { path: string; content: string; status: string; changes: unknown[] }[];
  deletedFiles?: string[];
  breakingChanges: unknown[];
  specDiff?: unknown;
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

  for (const file of body.files) {
    writeFileSafe(resolveProjectSafe(file.path), file.content);
  }

  const generated = generateCode(body.newSpec, source.options);
  const newFingerprints = collectFingerprints(generated);

  const newPaths = new Set(generated.map((f) => resolveProjectSafe(f.path)));
  const effectiveDir = `${source.outputDir.replace(/\/+$/, "")}/${source.options.sourceName}`;
  const deleted = cleanupOrphanFiles(effectiveDir, newPaths);

  persistCaches(body.name, newFingerprints, body.newSpec);

  const mergedFiles: Record<string, string> = {};
  for (const f of body.files) mergedFiles[f.path] = f.content;
  const userModified = detectUserModified(newFingerprints, mergedFiles);
  const endpointCount = Object.keys(newFingerprints).length;

  config = updateSource(config, body.name, computeSpecHash(body.newSpec), endpointCount, userModified);
  saveRegistry(config, body.configPath);

  return { success: true, written: body.files.length, deleted };
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
