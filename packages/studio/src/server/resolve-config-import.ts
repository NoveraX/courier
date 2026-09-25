/**
 * Resolve one import specifier written in a config file to a file on disk.
 *
 * This is deliberately not a general module resolver: it answers only "which
 * file does this name refer to", for the specifiers a config can carry — a
 * relative or absolute path, or a bare name the project's tsconfig `paths`
 * maps to one of its own modules. A package or a node builtin resolves to
 * nothing, because neither is a file the config's reload should track.
 */

import { existsSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import type { PathAliases } from "@noverax/courier-studio-core/config";

/** Extensions tried when an import has none — TS first, then bundler outputs. */
export const RESOLVE_EXTENSIONS: ReadonlyArray<string> = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];

/**
 * Resolve `specifier` as written inside a file in `fromDir`.
 *
 * @param fromDir - Directory of the file the specifier was written in
 * @param specifier - The import specifier, exactly as written
 * @param aliases - The project's tsconfig path aliases
 * @returns The absolute file path, or `null` when it names no local file
 *
 * @example
 * ```ts
 * resolveConfigImport("/app", "./src/api", aliases); // → "/app/src/api.ts"
 * resolveConfigImport("/app", "node:fs", aliases); // → null
 * ```
 */
export function resolveConfigImport(
  fromDir: string,
  specifier: string,
  aliases: PathAliases,
): string | null {
  for (const base of importBases(fromDir, specifier, aliases)) {
    const resolved = resolveFile(base);
    if (resolved) return resolved;
  }
  return null;
}

/**
 * The paths `specifier` may denote before any extension is tried: the path
 * it spells, or each target the project's tsconfig `paths` maps it to.
 *
 * @param fromDir - Directory of the file the specifier was written in
 * @param specifier - The import specifier, exactly as written
 * @param aliases - The project's tsconfig path aliases
 * @returns The absolute paths, in the order they are tried; empty for a
 *   package or a node builtin
 *
 * @example
 * ```ts
 * importBases("/app", "./src/api", aliases); // → ["/app/src/api"]
 * importBases("/app", "node:fs", aliases); // → []
 * ```
 */
export function importBases(fromDir: string, specifier: string, aliases: PathAliases): string[] {
  if (isPathSpecifier(specifier)) return [resolve(fromDir, specifier)];
  return aliases.candidatesFor(specifier);
}

/** True for a relative or absolute path — false for a bare/package specifier */
function isPathSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../") || isAbsolute(specifier);
}

/**
 * Take an extensionless path to a file: the path itself, then each known
 * extension, then `index.{ext}` when it names a directory.
 */
function resolveFile(path: string): string | null {
  const direct = tryExtensions(path);
  if (direct) return direct;
  if (existsSync(path) && statSync(path).isDirectory()) {
    return tryExtensions(resolve(path, "index"));
  }
  return null;
}

/** Try each known extension on `pathWithoutExt`, returning the first hit */
function tryExtensions(pathWithoutExt: string): string | null {
  if (existsSync(pathWithoutExt) && statSync(pathWithoutExt).isFile()) return pathWithoutExt;
  for (const extension of RESOLVE_EXTENSIONS) {
    const candidate = pathWithoutExt + extension;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}
