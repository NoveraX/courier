import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createLogger } from "@noverax/courier";

import { type PathAliases, readPathAliases } from "@noverax/courier-studio-core/config";

import { readModuleImports } from "./read-module-imports";
import { resolveConfigImport } from "./resolve-config-import";

const log = createLogger("Studio");

const NO_ALIASES: PathAliases = { loader: {}, candidatesFor: () => [] };

/**
 * Walk the config file, and the mocks file beside it, and return every local
 * TypeScript/JavaScript module they transitively import, each with the hash
 * of the bytes the walk read.
 *
 * Relative and absolute specifiers are followed directly; a bare one is
 * followed only when the project's tsconfig `paths` maps it to a file of its
 * own, which is how a config that imports `@/lib/sources` or `@shared/api`
 * still yields the modules behind those names. Everything else — a package, a
 * node builtin — is left alone. Each entry resolves aliases by the tsconfig
 * beside it.
 *
 * Every absent path the loader tries before the module an import names is
 * returned too, with `null`, and every path it tries for an import that
 * should name a local file and names none yet (see `resolveConfigImport`):
 * whoever evaluates the entries next may find a module there, and runs it,
 * so whoever watches must see it created. A compiled `api.js` written beside
 * `api.ts` is one.
 *
 * Where the tsconfig `paths` cannot be read, the walk warns and goes on
 * without aliases, so a load that then fails on the same tsconfig still has
 * every other module it depends on, and that tsconfig, watched.
 *
 * One walk covers every entry: a module the config and the mocks file both
 * import is read once, and so are cycles.
 *
 * @param entries - Absolute paths to walk from, the config first
 * @returns Each module's absolute path and the sha256 of what was read
 *   (`"unreadable"` when it could not be), in walk order, each existing entry
 *   first among the modules it reached; then each absent path the loader
 *   tries first, with `null`. Empty when no entry exists
 *
 * @example
 * ```ts
 * extractConfigDeps(["/app/courier.config.ts"]);
 * // → Map { "/app/courier.config.ts" => "2c26b4…", "/app/src/lib/sources.ts" => "fcde2b…" }
 * ```
 */
export function extractConfigDeps(entries: readonly string[]): Map<string, string | null> {
  const hashes = new Map<string, string>();
  const absent = new Set<string>();

  const walk = (file: string, aliases: PathAliases): void => {
    const normalized = resolve(file);
    if (hashes.has(normalized) || !existsSync(normalized)) return;
    const { contentHash, specifiers } = readModuleImports(normalized);
    hashes.set(normalized, contentHash);

    const fromDir = dirname(normalized);
    for (const specifier of specifiers) {
      const resolved = resolveConfigImport(fromDir, specifier, aliases);
      for (const path of resolved.absent) absent.add(path);
      if (resolved.file !== null) walk(resolved.file, aliases);
    }
  };

  const aliasesByDirectory = new Map<string, PathAliases>();
  for (const entry of entries) walk(entry, aliasesFor(dirname(resolve(entry)), aliasesByDirectory));
  /* A module another import reached after an earlier one found it absent was
     read, and its hash stands. */
  const deps = new Map<string, string | null>(hashes);
  for (const path of absent) if (!deps.has(path)) deps.set(path, null);
  return deps;
}

/* Read once for the entries that share a directory. The loader reads the
   same aliases, and fails the load with what threw. */
function aliasesFor(directory: string, read: Map<string, PathAliases>): PathAliases {
  const known = read.get(directory);
  if (known !== undefined) return known;
  let aliases: PathAliases;
  try {
    aliases = readPathAliases(directory);
  } catch (error) {
    log.warn(
      `Could not read the tsconfig paths that apply to ${directory}; aliased imports are not followed`,
      error,
    );
    aliases = NO_ALIASES;
  }
  read.set(directory, aliases);
  return aliases;
}
