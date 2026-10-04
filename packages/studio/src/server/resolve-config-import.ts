/**
 * Resolve one import specifier written in a config file to a file on disk.
 *
 * This is deliberately not a general module resolver: it answers only "which
 * file does this name refer to", for the specifiers a config can carry — a
 * relative or absolute path, or a bare name the project's tsconfig `paths`
 * maps to one of its own modules. A package or a node builtin resolves to
 * nothing, because neither is a file the config's reload should track.
 *
 * A path is tried as the module loader tries it (see `loaderCandidates`), so
 * the file named is the one the loader evaluates, and every absent path tried
 * before it is one where a module created would be evaluated instead.
 */

import { existsSync, type Stats, statSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, resolve } from "node:path";
import { createLogger } from "@noverax/courier";

import type { PathAliases } from "@noverax/courier-studio-core/config";

import { firstMissingPath } from "./first-missing-path";
import { loaderCandidates } from "./loader-candidates";

const log = createLogger("Studio");

/** The file an import names, and where a module created would take its place. */
export interface ConfigImport {
  /** The absolute path of the file the loader takes; `null` when the import names no local file. */
  file: string | null;
  /**
   * Each absent path the loader tries before `file` — every one it tries when
   * there is no `file` — each once, in the order tried. A path inside a
   * directory that does not exist is given as the first directory missing on
   * the way to it (see `firstMissingPath`), so the index files of an absent
   * path come down to the path itself.
   */
  absent: string[];
}

/**
 * Resolve `specifier` as written inside a file in `fromDir`.
 *
 * @param fromDir - Directory of the file the specifier was written in
 * @param specifier - The import specifier, exactly as written
 * @param aliases - The project's tsconfig path aliases
 * @returns The file the loader takes, if any, and each absent path it tries
 *   first; for a package or a node builtin, neither
 *
 * @example
 * ```ts
 * resolveConfigImport("/app", "./src/api", aliases);
 * // api.ts only → { file: "/app/src/api.ts", absent: ["/app/src/api", "/app/src/api.js", "/app/src/api.mjs", "/app/src/api.cjs"] }
 * resolveConfigImport("/app", "./src/api.js", aliases).file; // no api.js → "/app/src/api.ts"
 * resolveConfigImport("/app", "node:fs", aliases); // → { file: null, absent: [] }
 * ```
 */
export function resolveConfigImport(
  fromDir: string,
  specifier: string,
  aliases: PathAliases,
): ConfigImport {
  const tried: string[] = [];
  let file: string | null = null;
  for (const base of importBases(fromDir, specifier, aliases)) {
    file = resolveBase(base, tried);
    if (file !== null) break;
  }
  return { file, absent: absentAmong(tried) };
}

/* The paths `specifier` may denote before any extension is tried: the path
   it spells, or each target the project's tsconfig `paths` maps it to. */
function importBases(fromDir: string, specifier: string, aliases: PathAliases): string[] {
  if (isPathSpecifier(specifier)) return [resolve(fromDir, specifier)];
  return aliases.candidatesFor(specifier);
}

/** True for a relative or absolute path — false for a bare/package specifier */
/* `.` and `..` name a directory relative to the importer, as `./` does. */
function isPathSpecifier(specifier: string): boolean {
  return (
    specifier === "." ||
    specifier === ".." ||
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    isAbsolute(specifier)
  );
}

/* Adds to `tried` each path tried that the loader does not take. A FIFO a
   fallback names is taken, as Node's resolution takes it, and the walk then
   records it as unreadable rather than blocking on it. */
function resolveBase(base: string, tried: string[]): string | null {
  const { candidates, fallbacks } = loaderCandidates(base);
  for (const candidate of candidates) {
    if (statOf(candidate)?.isFile() === true) return candidate;
    tried.push(candidate);
  }
  const found = resolveWithNode(base);
  if (found !== null) return found;
  for (const fallback of fallbacks) {
    if (statOf(fallback)?.isDirectory() === false) return fallback;
    tried.push(fallback);
  }
  return null;
}

/* A path that cannot be looked at, behind a symlink loop or a directory
   Studio may not search, is no file the loader takes either. */
function statOf(path: string): Stats | undefined {
  return existsSync(path) ? statSync(path, { throwIfNoEntry: false }) : undefined;
}

/* The loader asks Node before it tries the TypeScript twin, and takes what
   Node finds: a `.json` or `.node` file, or a directory's `package.json`
   `main`. Node keeps each answer for the life of the process, so one whose
   file has gone since is no answer. */
function resolveWithNode(base: string): string | null {
  try {
    const found = createRequire(base).resolve(base);
    return existsSync(found) ? found : null;
  } catch (error) {
    log.debug(`Node's resolution finds no module at ${base}`, error);
    return null;
  }
}

function absentAmong(tried: readonly string[]): string[] {
  const absent = new Set<string>();
  for (const path of new Set(tried)) {
    const watchable = firstMissingPath(path);
    if (watchable !== null) absent.add(watchable);
  }
  return [...absent];
}
