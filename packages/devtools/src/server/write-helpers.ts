/**
 * Helpers for codegen write routes — merge and raw write logic.
 */

import type { GenerateOptions, ParsedSpec } from "../codegen";
import {
  addSource,
  getCachedFingerprints,
  loadCache,
  removeSource,
  saveRegistry,
} from "../codegen";
import { previewUpdate } from "../codegen/merge/update-flow";
import type { RegistryConfig, RegistrySource, SpecImportType } from "../codegen/registry/types";
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
import type { WriteBody, WriteResult } from "./write-types";

/** Merge write: preserves user edits via fingerprint diffing */
export function handleMergeWrite(
  files: WriteBody["files"],
  sourceName: string,
  spec: ParsedSpec,
  specUrl: string | undefined,
  importType: SpecImportType | undefined,
  options: GenerateOptions,
  config: RegistryConfig,
  source: RegistrySource,
): WriteResult {
  const preview = computeMergePreview(files, sourceName, source);

  for (const file of preview.files) {
    writeFileSafe(resolveProjectSafe(file.path), file.content);
  }

  const deleted = removeOrphanFiles(files, source, options);
  const result = finalizeRegistry(
    files,
    preview,
    sourceName,
    spec,
    specUrl,
    importType,
    options,
    config,
  );

  return { ...result, deleted };
}

/** Raw write: no merge, just write files to disk */
export function handleRawWrite(
  files: WriteBody["files"],
  sourceName: string | undefined,
  spec: ParsedSpec | undefined,
  specUrl: string | undefined,
  importType: SpecImportType | undefined,
  options: GenerateOptions | undefined,
  config: RegistryConfig,
): WriteResult {
  for (const file of files) {
    writeFileSafe(resolveProjectSafe(file.path), file.content);
  }

  if (sourceName && spec && options) {
    persistRawSource(files, sourceName, spec, specUrl, importType, options, config);
  }

  return {
    written: files.length,
    merged: 0,
    files: files.map((f) => ({ path: f.path, status: "safe" })),
  };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function computeMergePreview(
  files: WriteBody["files"],
  sourceName: string,
  source: RegistrySource,
) {
  const existingFiles = readFilesFromDisk(files.map((f) => f.path));
  const cache = loadCache();
  const cached = getCachedFingerprints(cache, sourceName);
  const fingerprints =
    Object.keys(cached).length > 0
      ? cached
      : buildFallbackFingerprints(existingFiles, source.userModified);

  return previewUpdate(fingerprints, files, existingFiles);
}

function removeOrphanFiles(
  files: WriteBody["files"],
  source: RegistrySource,
  options: GenerateOptions,
): number {
  const newPaths = new Set(files.map((f) => resolveProjectSafe(f.path)));
  const effectiveDir = `${source.outputDir.replace(/\/+$/, "")}/${options.sourceName}`;
  return cleanupOrphanFiles(effectiveDir, newPaths);
}

function finalizeRegistry(
  files: WriteBody["files"],
  preview: ReturnType<typeof previewUpdate>,
  sourceName: string,
  spec: ParsedSpec,
  specUrl: string | undefined,
  importType: SpecImportType | undefined,
  options: GenerateOptions,
  config: RegistryConfig,
): WriteResult {
  const newFingerprints = collectFingerprints(files);
  persistCaches(sourceName, newFingerprints, spec);

  const mergedFiles = Object.fromEntries(preview.files.map((f) => [f.path, f.content]));
  const userModified = detectUserModified(newFingerprints, mergedFiles);
  const count = Object.keys(newFingerprints).length;

  const updated =
    count === 0
      ? removeSource(config, sourceName)
      : addSource(
          config,
          sourceName,
          spec,
          specUrl ?? "",
          importType ?? "url",
          options,
          count,
          userModified,
        );
  saveRegistry(updated);

  const mergedCount = preview.files.filter((f) => f.status === "merged").length;
  return {
    written: preview.files.length,
    merged: mergedCount,
    files: preview.files.map((f) => ({ path: f.path, status: f.status })),
  };
}

function persistRawSource(
  files: WriteBody["files"],
  sourceName: string,
  spec: ParsedSpec,
  specUrl: string | undefined,
  importType: SpecImportType | undefined,
  options: GenerateOptions,
  config: RegistryConfig,
): void {
  const newFingerprints = collectFingerprints(files);
  const count = Object.keys(newFingerprints).length;
  if (count > 0) {
    const updated = addSource(
      config,
      sourceName,
      spec,
      specUrl ?? "",
      importType ?? "url",
      options,
      count,
    );
    saveRegistry(updated);
    persistCaches(sourceName, newFingerprints, spec);
  }
}
