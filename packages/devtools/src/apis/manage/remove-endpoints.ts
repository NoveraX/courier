/**
 * Preview removing endpoints — computes file changes without touching disk.
 */

import { extractEndpoints } from "../merge/extract-endpoints";
import { computeHash } from "../merge/hash";
import type { PersistedGenerateOptions } from "../registry/types";
import { detectOrphanSchemas } from "./detect-orphan-schemas";
import { removeEndpointsFromGroup } from "./remove-from-group";
import { removeOrphanSchemas } from "./remove-schemas";
import type { RemoveResult } from "./types";
import { removeGroupsFromSourceFile } from "./update-source-file";

/**
 * Generate a preview of what removing endpoints would produce.
 *
 * @param endpointsToRemove - Map of groupName → endpointName[] to remove
 * @param options - Persisted generation options
 * @param existingFiles - Map of filePath → content for files on disk
 * @param fingerprints - Stored endpoint fingerprints
 * @returns RemoveResult with modified files, deleted files, and warnings
 */
export function previewRemoveEndpoints(
  endpointsToRemove: Record<string, string[]>,
  options: PersistedGenerateOptions,
  existingFiles: Record<string, string>,
  fingerprints: Record<string, string>,
): RemoveResult {
  const baseDir = `${options.outputDir.replace(/\/+$/, "")}/${options.sourceName}`;
  const modifiedFiles: Array<{ path: string; content: string }> = [];
  const deletedFiles: string[] = [];
  const removedFingerprints: string[] = [];
  const modifiedEndpointsWarning: string[] = [];
  const deletedGroupNames: string[] = [];

  // Check for user-modified endpoints being removed
  collectModifiedWarnings(endpointsToRemove, fingerprints, existingFiles, modifiedEndpointsWarning);

  // Process each group
  for (const [groupName, endpointNames] of Object.entries(endpointsToRemove)) {
    const groupPath = findGroupFile(baseDir, groupName, existingFiles);
    if (!groupPath) continue;

    const content = existingFiles[groupPath] ?? "";
    const result = removeEndpointsFromGroup(content, endpointNames);

    if (result === null) {
      // All endpoints removed — delete entire group
      deletedFiles.push(groupPath);
      deletedGroupNames.push(groupName);
      collectGroupDeletions(baseDir, groupName, existingFiles, deletedFiles);
    } else {
      modifiedFiles.push({ path: groupPath, content: result });
    }

    // Collect fingerprints to remove
    for (const name of endpointNames) {
      if (fingerprints[name]) removedFingerprints.push(name);
    }
  }

  // Handle orphaned schemas
  const orphanedSchemas = processOrphanSchemas(
    baseDir,
    endpointsToRemove,
    existingFiles,
    modifiedFiles,
    deletedFiles,
  );

  // Update source.ts if groups were deleted
  let sourceFileUpdate: RemoveResult["sourceFileUpdate"];
  if (deletedGroupNames.length > 0) {
    const sourcePath = `${baseDir}/source.ts`;
    const sourceContent = existingFiles[sourcePath];
    if (sourceContent) {
      sourceFileUpdate = {
        path: sourcePath,
        content: removeGroupsFromSourceFile(sourceContent, deletedGroupNames),
      };
    }
  }

  return {
    modifiedFiles,
    deletedFiles,
    sourceFileUpdate,
    removedFingerprints,
    orphanedSchemas,
    modifiedEndpointsWarning,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function findGroupFile(
  baseDir: string,
  groupName: string,
  existingFiles: Record<string, string>,
): string | undefined {
  const dirPrefix = `${baseDir}/${groupName}/`;
  return (
    Object.keys(existingFiles).find((p) => p.startsWith(dirPrefix) && p.endsWith("/index.ts")) ??
    Object.keys(existingFiles).find(
      (p) => p.startsWith(dirPrefix) && p.endsWith(`/${groupName}.ts`),
    )
  );
}

/** Collect all files in a group directory for deletion */
function collectGroupDeletions(
  baseDir: string,
  groupName: string,
  existingFiles: Record<string, string>,
  deletedFiles: string[],
): void {
  const dirPrefix = `${baseDir}/${groupName}/`;
  for (const path of Object.keys(existingFiles)) {
    if (path.startsWith(dirPrefix) && !deletedFiles.includes(path)) {
      deletedFiles.push(path);
    }
  }
}

function collectModifiedWarnings(
  endpointsToRemove: Record<string, string[]>,
  fingerprints: Record<string, string>,
  existingFiles: Record<string, string>,
  warnings: string[],
): void {
  const diskHashes: Record<string, string> = {};
  for (const content of Object.values(existingFiles)) {
    for (const [name, code] of Object.entries(extractEndpoints(content))) {
      diskHashes[name] = computeHash(code);
    }
  }

  for (const names of Object.values(endpointsToRemove)) {
    for (const name of names) {
      const stored = fingerprints[name];
      const disk = diskHashes[name];
      if (stored && disk && stored !== disk) warnings.push(name);
    }
  }
}

function processOrphanSchemas(
  baseDir: string,
  endpointsToRemove: Record<string, string[]>,
  existingFiles: Record<string, string>,
  modifiedFiles: Array<{ path: string; content: string }>,
  deletedFiles: string[],
): string[] {
  const allOrphans: string[] = [];

  for (const groupName of Object.keys(endpointsToRemove)) {
    const schemaPath = `${baseDir}/${groupName}/schemas.ts`;
    const schemaContent = existingFiles[schemaPath];
    if (!schemaContent) continue;

    // If the entire group is deleted, all schemas are orphaned
    if (deletedFiles.includes(schemaPath)) continue;

    // Get remaining group content
    const modifiedGroup = modifiedFiles.find((f) => f.path.includes(`/${groupName}/`));
    if (!modifiedGroup) continue;

    const orphans = detectOrphanSchemas(schemaContent, modifiedGroup.content);
    if (orphans.length === 0) continue;

    allOrphans.push(...orphans);
    const cleaned = removeOrphanSchemas(schemaContent, orphans);
    if (cleaned === null) {
      deletedFiles.push(schemaPath);
    } else {
      modifiedFiles.push({ path: schemaPath, content: cleaned });
    }
  }

  return allOrphans;
}
