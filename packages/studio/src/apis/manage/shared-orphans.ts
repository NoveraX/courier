import type { ImportLayout, SchemaFileKind } from "../layout";
import { detectOrphanSchemas } from "./detect-orphan-schemas";
import { removeOrphanSchemas } from "./remove-schemas";

const SCHEMA_FILES: readonly SchemaFileKind[] = ["schemas", "types"];

/** What a removal has changed so far, which this adds to. */
export interface RemovalSoFar {
  modifiedFiles: Array<{ path: string; content: string }>;
  deletedFiles: string[];
}

/**
 * Remove, from the import's own schemas or types module, the declarations
 * that only what the removal took used: the API's own endpoints removed,
 * and a group's endpoints or schemas removed, since groups import the
 * schemas they share from there. A declaration anything left in the import
 * uses stays — an endpoint in the source or a group's file, a schema in a
 * group's module — and so does one the removal never touched, such as one
 * the user added. The barrel and the proxy caller do not count: the barrel
 * is written again from what stays. A module left with no declaration goes.
 *
 * @param layout - Where the import's files are
 * @param removedCode - The code of the endpoints removed, by group
 * @param existingFiles - The import's files before the removal, by path
 * @param removal - The files the removal rewrites and deletes, which this adds to
 * @returns The names removed
 * @example
 * ```ts
 * processSharedOrphans(layout, new Map([["pets", [code]]]), files, { modifiedFiles, deletedFiles });
 * ```
 */
export function processSharedOrphans(
  layout: ImportLayout,
  removedCode: ReadonlyMap<string, readonly string[]>,
  existingFiles: Record<string, string>,
  removal: RemovalSoFar,
): string[] {
  const { modifiedFiles, deletedFiles } = removal;
  const changed = new Map(modifiedFiles.map((file) => [file.path, file.content]));
  const gone = new Set(deletedFiles);
  /* What the removal took: the endpoints, and every schema module it changed or deleted as it was. */
  const touched = [
    ...[...removedCode.values()].flat(),
    ...Object.entries(existingFiles)
      .filter(([path]) => (changed.has(path) || gone.has(path)) && isSchemaModule(path))
      .map(([, content]) => content),
  ];
  const skipped = new Set([
    layout.indexFile,
    layout.proxyFile,
    ...SCHEMA_FILES.map(layout.schemaFile),
  ]);
  const remaining = [...new Set([...Object.keys(existingFiles), ...changed.keys()])]
    .filter((path) => !gone.has(path) && !skipped.has(path))
    .map((path) => changed.get(path) ?? existingFiles[path] ?? "");
  const orphans: string[] = [];
  for (const kind of SCHEMA_FILES) {
    const path = layout.schemaFile(kind);
    const content = existingFiles[path];
    if (content === undefined || gone.has(path)) continue;
    const found = detectOrphanSchemas(content, remaining, touched);
    if (found.length === 0) continue;
    orphans.push(...found);
    const cleaned = removeOrphanSchemas(content, found);
    if (cleaned === null) deletedFiles.push(path);
    else modifiedFiles.push({ path, content: cleaned });
  }
  return orphans;
}

function isSchemaModule(path: string): boolean {
  return path.endsWith("/schemas.ts") || path.endsWith("/types.ts");
}
