/**
 * Orphan schema processing for endpoint removal.
 */

import type { ImportLayout } from "../layout";
import { detectOrphanSchemas } from "./detect-orphan-schemas";
import { removeOrphanSchemas } from "./remove-schemas";

/**
 * Remove the schemas that only the removed endpoints used: a schema they
 * did not use — one the user added, say — stays, used or not.
 */
export function processOrphanSchemas(
  layout: ImportLayout,
  removedCode: ReadonlyMap<string, readonly string[]>,
  existingFiles: Record<string, string>,
  modifiedFiles: Array<{ path: string; content: string }>,
  deletedFiles: string[],
): string[] {
  const allOrphans: string[] = [];

  for (const [groupName, code] of removedCode) {
    const schemaPath = layout.groupSchemaFile(groupName, "schemas");
    const schemaContent = existingFiles[schemaPath];
    if (!schemaContent) continue;

    // If the entire group is deleted, all schemas are orphaned
    if (deletedFiles.includes(schemaPath)) continue;

    // Get remaining group content
    const groupFile = layout.groupFile(groupName);
    const modifiedGroup = modifiedFiles.find((f) => f.path === groupFile);
    if (!modifiedGroup) continue;

    const orphans = detectOrphanSchemas(schemaContent, modifiedGroup.content, code.join("\n"));
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
