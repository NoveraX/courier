/**
 * Preview removing endpoints — computes file changes without touching disk.
 */

import type { GenerateOptions } from "../generator/types";
import { removeEndpointsFromGroup } from "./remove-from-group";
import { collectGroupDeletions, collectModifiedWarnings, findGroupFile } from "./remove-helpers";
import { processOrphanSchemas } from "./remove-orphans";
import type { RemoveResult } from "./types";
import { removeGroupsFromSourceFile } from "./update-source-file";

/**
 * Generate a preview of what removing endpoints would produce.
 *
 * @param endpointsToRemove - Map of groupName -> endpointName[] to remove
 * @param options - Persisted generation options
 * @param existingFiles - Map of filePath -> content for files on disk
 * @param fingerprints - Stored endpoint fingerprints
 * @returns RemoveResult with modified files, deleted files, and warnings
 */
export function previewRemoveEndpoints(
  endpointsToRemove: Record<string, string[]>,
  options: GenerateOptions,
  existingFiles: Record<string, string>,
  fingerprints: Record<string, string>,
): RemoveResult {
  const baseDir = `${options.outputDir.replace(/\/+$/, "")}/${options.sourceName ?? "api"}`;
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
