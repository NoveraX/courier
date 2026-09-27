/**
 * Orphan schema processing for endpoint removal.
 */

import type { ImportLayout } from "../layout";
import { detectOrphanSchemas } from "./detect-orphan-schemas";
import { removeOrphanSchemas } from "./remove-schemas";

/** Find and clean up orphaned schemas after endpoints are removed */
export function processOrphanSchemas(
  layout: ImportLayout,
  endpointsToRemove: Record<string, string[]>,
  existingFiles: Record<string, string>,
  modifiedFiles: Array<{ path: string; content: string }>,
  deletedFiles: string[],
): string[] {
  const allOrphans: string[] = [];

  for (const groupName of Object.keys(endpointsToRemove)) {
    const schemaPath = layout.groupSchemaFile(groupName, "schemas");
    const schemaContent = existingFiles[schemaPath];
    if (!schemaContent) continue;

    // If the entire group is deleted, all schemas are orphaned
    if (deletedFiles.includes(schemaPath)) continue;

    // Get remaining group content
    const groupFile = layout.groupFile(groupName);
    const modifiedGroup = modifiedFiles.find((f) => f.path === groupFile);
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
