import { posix } from "node:path";
import type { ImportLayout } from "../layout";
import { removeBarrelExports } from "./remove-barrel-exports";
import { restoreLostNames } from "./restore-lost-names";
import type { RemoveResult } from "./types";

/* A group's schemas or types file, relative to the import's folder. */
const GROUP_MODULE = /^[^/]+\/(?:schemas|types)\.ts$/;

/**
 * The barrel as a removal leaves it: without the re-exports of the modules
 * it deletes, and without the names the modules it rewrites no longer
 * export, but with every name it exported that a module it keeps still
 * exports.
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
  if (barrel === index) return undefined;
  const pathOf = (module: string): string => posix.join(layout.dir, `${module}.ts`);
  const before = (module: string): string | undefined => existingFiles[pathOf(module)];
  const after = (module: string): string | undefined =>
    changed.has(module) ? (changed.get(module) ?? undefined) : before(module);
  const staying = Object.keys(existingFiles)
    .map((path) => posix.relative(layout.dir, path))
    .filter((relative) => GROUP_MODULE.test(relative))
    .map((relative) => `./${relative.replace(/\.ts$/, "")}`)
    .filter((module) => after(module) !== undefined)
    .sort();
  const content = restoreLostNames(layout.indexFile, index, barrel, { before, after, staying });
  return { path: layout.indexFile, content };
}
