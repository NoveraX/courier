/**
 * Merge preview and orphan cleanup helpers for write flow.
 */

import type { GenerateOptions, ParsedSpec } from "../apis";
import { addSource, getCachedFingerprints, loadCache, saveRegistry } from "../apis";
import { previewUpdate } from "../apis/merge/update-flow";
import type {
  RegistryConfig,
  RegistrySource,
  SpecImportType,
  UpdateResult,
} from "../apis/registry/types";
import { resolveProjectSafe } from "../context";
import { cleanupOrphanFiles } from "./cleanup-orphans";
import {
  buildFallbackFingerprints,
  collectFingerprints,
  persistCaches,
  readFilesFromDisk,
} from "./registry-helpers";
import type { WriteBody } from "./write-types";

export function computeMergePreview(
  files: WriteBody["files"],
  sourceName: string,
  source: RegistrySource,
): UpdateResult {
  const existingFiles = readFilesFromDisk(files.map((f) => f.path));
  const cache = loadCache();
  const cached = getCachedFingerprints(cache, sourceName);
  const fingerprints =
    Object.keys(cached).length > 0
      ? cached
      : buildFallbackFingerprints(existingFiles, source.userModified);

  return previewUpdate(fingerprints, files, existingFiles);
}

export function removeOrphanFiles(
  files: WriteBody["files"],
  source: RegistrySource,
  options: GenerateOptions,
): number {
  const newPaths = new Set(files.map((f) => resolveProjectSafe(f.path)));
  const effectiveDir = `${source.options.outputDir.replace(/\/+$/, "")}/${options.sourceName}`;
  return cleanupOrphanFiles(effectiveDir, newPaths);
}

export function persistRawSource(
  files: WriteBody["files"],
  sourceName: string,
  spec: ParsedSpec,
  specUrl: string | undefined,
  importType: SpecImportType | undefined,
  options: GenerateOptions,
  config: RegistryConfig,
): void {
  const newFingerprints = collectFingerprints(files);
  if (Object.keys(newFingerprints).length > 0) {
    const updated = addSource(
      config,
      sourceName,
      spec,
      specUrl ?? "",
      importType ?? "url",
      options,
    );
    saveRegistry(updated);
    persistCaches(sourceName, newFingerprints, spec);
  }
}
