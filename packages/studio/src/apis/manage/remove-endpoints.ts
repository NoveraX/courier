/**
 * Preview removing endpoints — computes file changes without touching disk.
 */

import type { ImportLayout } from "../layout";
import { ownValue } from "../own-value";
import { isTopLevel } from "../parser/top-level";
import { barrelAfterRemoval } from "./barrel-after-removal";
import { withoutEmptyEndpoints } from "./prune-own-endpoints";
import { removeEndpointsFromFile } from "./remove-endpoints-from-file";
import { collectGroupDeletions, collectModifiedWarnings, endpointFile } from "./remove-helpers";
import { withoutInnerGroups } from "./remove-inner-groups";
import { processOrphanSchemas } from "./remove-orphans";
import { processSharedOrphans, type RemovalSoFar } from "./shared-orphans";
import type { RemoveResult } from "./types";
import { removeGroupsFromSourceFile } from "./update-source-file";

/**
 * Generate a preview of what removing endpoints would produce: the API's
 * own endpoints go from the source, which stays; a group's from its file,
 * which goes with its folder once nothing is left in it. The schemas only
 * they used go too, from the group's module and from the import's own.
 *
 * @param endpointsToRemove - The endpoints to remove, by group; under `""` the API's own
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
  const removal: RemovalSoFar = { modifiedFiles: [], deletedFiles: [] };
  const removedFingerprints: string[] = [];
  const modifiedEndpointsWarning: string[] = [];
  const deletedGroupNames: string[] = [];

  collectModifiedWarnings(
    endpointsToRemove,
    fingerprints,
    existingFiles,
    layout,
    modifiedEndpointsWarning,
  );
  const removedCode = new Map<string, string[]>();

  for (const [groupName, endpointNames] of Object.entries(endpointsToRemove)) {
    const path = endpointFile(layout, groupName, existingFiles);
    if (!path) continue;

    const { content: result, removedCode: code } = removeEndpointsFromFile(
      path,
      existingFiles[path] ?? "",
      endpointNames,
      { keepEmpty: isTopLevel(groupName) },
    );
    removedCode.set(groupName, code);

    if (result === null) {
      removal.deletedFiles.push(path);
      deletedGroupNames.push(groupName);
      collectGroupDeletions(layout, groupName, existingFiles, removal.deletedFiles);
    } else {
      removal.modifiedFiles.push({ path, content: result });
    }
    for (const name of endpointNames) {
      if (ownValue(fingerprints[path] ?? {}, name)) removedFingerprints.push(name);
    }
  }

  const orphanedSchemas = processOrphanSchemas(
    layout,
    removedCode,
    existingFiles,
    removal.modifiedFiles,
    removal.deletedFiles,
  );
  /* A group inside another leaves its parent's file, and a parent left empty goes with it. */
  const gone = withoutInnerGroups(deletedGroupNames, existingFiles, layout, removal);
  settleSource(gone, existingFiles, layout, removal);
  orphanedSchemas.push(...processSharedOrphans(layout, removedCode, existingFiles, removal));
  const barrel = barrelAfterRemoval(
    layout,
    existingFiles,
    removal.modifiedFiles,
    removal.deletedFiles,
  );
  return {
    ...removal,
    ...(barrel !== undefined && { indexFileUpdate: barrel }),
    removedFingerprints,
    orphanedSchemas,
    modifiedEndpointsWarning,
  };
}

/* The source as the removal leaves it, in one change: without the groups
   removed whole, and without what the API's own endpoints needed once the
   last of them is gone. */
function settleSource(
  groups: string[],
  existingFiles: Record<string, string>,
  layout: ImportLayout,
  removal: RemovalSoFar,
): void {
  const path = layout.sourceFile;
  const at = removal.modifiedFiles.findIndex((file) => file.path === path);
  const before = removal.modifiedFiles[at]?.content ?? existingFiles[path];
  if (before === undefined) return;
  const content = withoutEmptyEndpoints(
    path,
    groups.length === 0 ? before : removeGroupsFromSourceFile(path, before, groups),
  );
  if (at !== -1) removal.modifiedFiles[at] = { path, content };
  else if (content !== before) removal.modifiedFiles.push({ path, content });
}
