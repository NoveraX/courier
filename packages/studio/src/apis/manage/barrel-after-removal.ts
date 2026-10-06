import type { ImportLayout } from "../layout";
import { rebuildBarrel } from "./rebuild-barrel";
import type { RemoveResult } from "./types";

/**
 * The barrel as a removal leaves it: its re-exports of the import's schema
 * modules written again from the files the removal leaves, as a full write
 * writes them.
 *
 * @param layout - Where the import's files are
 * @param existingFiles - The import's files before the removal, by path
 * @param modified - The files the removal rewrites
 * @param deleted - The files the removal deletes
 * @returns The barrel's update, or `undefined` when it stays as it is
 * @throws {UnrecognizedFileError} When the barrel does not parse
 * @example
 * ```ts
 * const indexFileUpdate = barrelAfterRemoval(layout, files, result.modifiedFiles, result.deletedFiles);
 * ```
 */
export function barrelAfterRemoval(
  layout: ImportLayout,
  existingFiles: Record<string, string>,
  modified: ReadonlyArray<{ path: string; content: string }>,
  deleted: readonly string[],
): RemoveResult["indexFileUpdate"] {
  const index = existingFiles[layout.indexFile];
  if (index === undefined) return undefined;
  const gone = new Set(deleted);
  const final = Object.fromEntries(
    Object.entries(existingFiles).filter(([path]) => !gone.has(path)),
  );
  for (const file of modified) final[file.path] = file.content;
  const barrel = rebuildBarrel(layout, final);
  return barrel === undefined || barrel === index
    ? undefined
    : { path: layout.indexFile, content: barrel };
}
