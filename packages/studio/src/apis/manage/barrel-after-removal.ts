import { posix } from "node:path";
import type { ImportLayout } from "../layout";
import { removeBarrelExports } from "./remove-barrel-exports";
import type { RemoveResult } from "./types";

/**
 * The barrel as a removal leaves it: without the re-exports of the modules
 * it deletes, and without the names the modules it rewrites no longer
 * export.
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
  const specifier = (path: string): string =>
    `./${posix.relative(layout.dir, path).replace(/\.ts$/, "")}`;
  const changed = new Map<string, string | null>();
  for (const path of deleted) changed.set(specifier(path), null);
  for (const file of modified) changed.set(specifier(file.path), file.content);
  const barrel = removeBarrelExports(layout.indexFile, index, changed);
  return barrel === index ? undefined : { path: layout.indexFile, content: barrel };
}
