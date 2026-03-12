/**
 * Helpers for codegen write routes — merge and raw write logic.
 */

import type { GenerateOptions, ParsedSpec } from "../codegen";
import {
  addSource,
  removeSource,
  saveRegistry,
} from "../codegen";
import type { RegistryConfig, RegistrySource, SpecImportType, UpdateResult } from "../codegen/registry/types";
import { resolveProjectSafe } from "../context";
import { computeMergePreview, persistRawSource, removeOrphanFiles } from "./merge-preview";
import {
  collectFingerprints,
  detectUserModified,
  persistCaches,
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

function finalizeRegistry(
  files: WriteBody["files"],
  preview: UpdateResult,
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
