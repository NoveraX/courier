import type { ImportLayout } from "../layout";
import { extractEndpoints } from "../merge/extract-endpoints";
import { computeHash } from "../merge/hash";
import { ownValue } from "../own-value";
import { barrelAfterRemoval } from "./barrel-after-removal";
import { detectOrphanSchemas } from "./detect-orphan-schemas";
import { FLAT_GROUP } from "./flat-import";
import { removeEndpointsFromFile } from "./remove-endpoints-from-file";
import { removeOrphanSchemas } from "./remove-schemas";
import type { RemoveResult } from "./types";

/**
 * Preview removing endpoints of an import generated flat: they go from its
 * `source.ts`, which stays even when none is left, and so do the schemas
 * only they used, and the barrel's re-exports of those.
 *
 * @param names - The endpoints to remove
 * @param existingFiles - The import's files as they are, by path
 * @param fingerprints - Studio's recorded endpoint fingerprints, by file
 * @param layout - Where the import's files are
 * @returns What removing them changes
 * @throws {UnrecognizedFileError} When `source.ts` does not parse, or declares no endpoints object
 */
export function previewRemoveFlatEndpoints(
  names: readonly string[],
  existingFiles: Record<string, string>,
  fingerprints: Record<string, Record<string, string>>,
  layout: ImportLayout,
): RemoveResult {
  const result: RemoveResult = {
    modifiedFiles: [],
    deletedFiles: [],
    removedFingerprints: [],
    orphanedSchemas: [],
    modifiedEndpointsWarning: [],
  };
  const source = existingFiles[layout.sourceFile];
  if (source === undefined) return result;
  const onDisk = extractEndpoints(source);
  for (const name of names) {
    const stored = ownValue(fingerprints[layout.sourceFile] ?? {}, name);
    const code = ownValue(onDisk, name);
    if (stored) result.removedFingerprints.push(name);
    if (stored && code !== undefined && stored !== computeHash(code))
      result.modifiedEndpointsWarning.push(`${FLAT_GROUP}.${name}`);
  }
  const { content, removedCode } = removeEndpointsFromFile(layout.sourceFile, source, names, {
    keepEmpty: true,
  });
  if (content === null || content === source) return result;
  result.modifiedFiles.push({ path: layout.sourceFile, content });
  const schemaPath = layout.schemaFile("schemas");
  const schemas = existingFiles[schemaPath];
  if (schemas === undefined) return result;
  const orphans = detectOrphanSchemas(schemas, content, removedCode.join("\n"));
  if (orphans.length === 0) return result;
  result.orphanedSchemas.push(...orphans);
  const cleaned = removeOrphanSchemas(schemas, orphans);
  if (cleaned === null) result.deletedFiles.push(schemaPath);
  else result.modifiedFiles.push({ path: schemaPath, content: cleaned });
  const barrel = barrelAfterRemoval(
    layout,
    existingFiles,
    result.modifiedFiles,
    result.deletedFiles,
  );
  if (barrel !== undefined) result.indexFileUpdate = barrel;
  return result;
}
