import type { ImportLayout, SchemaFileKind } from "../layout";
import { detectOrphanSchemas } from "./detect-orphan-schemas";
import { removeOrphanSchemas } from "./remove-schemas";

const SCHEMA_FILES: readonly SchemaFileKind[] = ["schemas", "types"];

/**
 * Remove, from each group's schemas or types file, the declarations that
 * only the removed endpoints used: a schema they did not use — one the user
 * added, say — stays, used or not. A file left with no declaration goes.
 *
 * @param layout - Where the import's files are
 * @param removedCode - The code of the endpoints removed, by group
 * @param existingFiles - The import's files before the removal, by path
 * @param modifiedFiles - The files the removal rewrites, which this adds to
 * @param deletedFiles - The files the removal deletes, which this adds to
 * @returns The names removed
 * @example
 * ```ts
 * processOrphanSchemas(layout, new Map([["pets", [code]]]), files, modified, deleted);
 * ```
 */
export function processOrphanSchemas(
  layout: ImportLayout,
  removedCode: ReadonlyMap<string, readonly string[]>,
  existingFiles: Record<string, string>,
  modifiedFiles: Array<{ path: string; content: string }>,
  deletedFiles: string[],
): string[] {
  const orphans: string[] = [];
  for (const [group, code] of removedCode) {
    const remaining = modifiedFiles.find((f) => f.path === layout.groupFile(group));
    if (remaining === undefined) continue;
    for (const kind of SCHEMA_FILES) {
      const path = layout.groupSchemaFile(group, kind);
      const content = existingFiles[path];
      if (content === undefined || deletedFiles.includes(path)) continue;
      const found = detectOrphanSchemas(content, remaining.content, code);
      if (found.length === 0) continue;
      orphans.push(...found);
      const cleaned = removeOrphanSchemas(content, found);
      if (cleaned === null) deletedFiles.push(path);
      else modifiedFiles.push({ path, content: cleaned });
    }
  }
  return orphans;
}
