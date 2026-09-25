import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import type { PathAliases } from "@noverax/courier-studio-core/config";

import { importBases, RESOLVE_EXTENSIONS } from "./resolve-config-import";

/**
 * Every absent path whose creation could give an import that names no file
 * one to name: each path the specifier may denote, with each extension the
 * resolution tries, and the index files of one that is a directory.
 *
 * Watched, they let a load that could not resolve the import — or one that
 * could, only because the module appeared after the dependency walk looked
 * for it — be followed by a reload once the module exists.
 *
 * A path inside a directory that does not exist is given as the first
 * directory missing on the way to it: nothing inside a directory can be
 * watched before it exists, and creating it comes first. The load that
 * follows resolves the import again and names the paths inside it.
 *
 * @param fromDir - Directory of the file the specifier was written in
 * @param specifier - The specifier, exactly as written, which
 *   `resolveConfigImport` resolved to nothing
 * @param aliases - The project's tsconfig path aliases
 * @returns The absent paths, each once; empty for a package or a node builtin
 *
 * @example
 * ```ts
 * absentImportCandidates("/app", "./src/late", aliases);
 * // → ["/app/src/late", "/app/src/late.ts", "/app/src/late.tsx", …]
 * absentImportCandidates("/app", "./generated/api", aliases); // no generated/
 * // → ["/app/generated"]
 * ```
 */
export function absentImportCandidates(
  fromDir: string,
  specifier: string,
  aliases: PathAliases,
): string[] {
  const absent = new Set<string>();
  for (const base of importBases(fromDir, specifier, aliases)) {
    for (const path of triedPaths(base)) {
      const watchable = firstMissing(path);
      if (watchable !== null) absent.add(watchable);
    }
  }
  return [...absent];
}

function withExtensions(path: string): string[] {
  return [path, ...RESOLVE_EXTENSIONS.map((extension) => path + extension)];
}

/* The index files count only for a directory: while the base is absent,
   creating it — as a file or a directory — is the change to wait for. */
function triedPaths(base: string): string[] {
  if (!(existsSync(base) && statSync(base).isDirectory())) return withExtensions(base);
  return [...withExtensions(base), ...withExtensions(join(base, "index"))];
}

/** The path when its directory exists, else the first missing directory above it; `null` when it exists. */
function firstMissing(path: string): string | null {
  if (existsSync(path)) return null;
  const parent = dirname(path);
  if (parent === path) return null;
  return existsSync(parent) ? path : firstMissing(parent);
}
