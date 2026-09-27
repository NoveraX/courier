/**
 * Preview removing endpoints — computes file changes without touching disk.
 */

import type { ImportLayout } from "../layout";
import { removeBarrelExports } from "./remove-barrel-exports";
import { removeEndpointsFromFile } from "./remove-endpoints-from-file";
import { collectGroupDeletions, collectModifiedWarnings, findGroupFile } from "./remove-helpers";
import { processOrphanSchemas } from "./remove-orphans";
import type { RemoveResult } from "./types";
import { removeGroupsFromSourceFile } from "./update-source-file";

/**
 * Generate a preview of what removing endpoints would produce.
 *
 * @param endpointsToRemove - Map of groupName -> endpointName[] to remove
 * @param existingFiles - Map of filePath -> content for files on disk
 * @param fingerprints - Stored endpoint fingerprints, by file
 * @param layout - Where the import's files are
 * @returns RemoveResult with modified files, deleted files, and warnings
 */
export function previewRemoveEndpoints(
  endpointsToRemove: Record<string, string[]>,
  existingFiles: Record<string, string>,
  fingerprints: Record<string, Record<string, string>>,
  layout: ImportLayout,
): RemoveResult {
  const modifiedFiles: Array<{ path: string; content: string }> = [];
  const deletedFiles: string[] = [];
  const removedFingerprints: string[] = [];
  const modifiedEndpointsWarning: string[] = [];
  const deletedGroupNames: string[] = [];

  // Check for user-modified endpoints being removed
  collectModifiedWarnings(
    endpointsToRemove,
    fingerprints,
    existingFiles,
    layout,
    modifiedEndpointsWarning,
  );
  const removedCode = new Map<string, string[]>();

  // Process each group
  for (const [groupName, endpointNames] of Object.entries(endpointsToRemove)) {
    const groupPath = findGroupFile(layout, groupName, existingFiles);
    if (!groupPath) continue;

    const content = existingFiles[groupPath] ?? "";
    const { content: result, removedCode: code } = removeEndpointsFromFile(
      groupPath,
      content,
      endpointNames,
    );
    removedCode.set(groupName, code);

    if (result === null) {
      // All endpoints removed — delete entire group
      deletedFiles.push(groupPath);
      deletedGroupNames.push(groupName);
      collectGroupDeletions(layout, groupName, existingFiles, deletedFiles);
    } else {
      modifiedFiles.push({ path: groupPath, content: result });
    }

    // Collect fingerprints to remove
    for (const name of endpointNames) {
      if (fingerprints[groupPath]?.[name]) removedFingerprints.push(name);
    }
  }

  // Handle orphaned schemas
  const orphanedSchemas = processOrphanSchemas(
    layout,
    removedCode,
    existingFiles,
    modifiedFiles,
    deletedFiles,
  );

  return {
    modifiedFiles,
    deletedFiles,
    ...withoutGroups(deletedGroupNames, existingFiles, layout),
    removedFingerprints,
    orphanedSchemas,
    modifiedEndpointsWarning,
  };
}

/* source.ts no longer imports the groups removed whole, and the barrel no longer re-exports them. */
function withoutGroups(
  groups: string[],
  existingFiles: Record<string, string>,
  layout: ImportLayout,
): Pick<RemoveResult, "sourceFileUpdate" | "indexFileUpdate"> {
  if (groups.length === 0) return {};
  const source = existingFiles[layout.sourceFile];
  const index = existingFiles[layout.indexFile];
  const modules = new Set(
    groups.flatMap((group) => [
      layout.groupSpecifier(group, "schemas"),
      layout.groupSpecifier(group, "types"),
    ]),
  );
  const barrel =
    index === undefined ? undefined : removeBarrelExports(layout.indexFile, index, modules);
  const sourceFile = source && removeGroupsFromSourceFile(layout.sourceFile, source, groups);
  return {
    ...(sourceFile && { sourceFileUpdate: { path: layout.sourceFile, content: sourceFile } }),
    ...(barrel !== undefined &&
      barrel !== index && { indexFileUpdate: { path: layout.indexFile, content: barrel } }),
  };
}
