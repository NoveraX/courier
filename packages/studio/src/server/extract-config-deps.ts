import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { type PathAliases, readPathAliases } from "@noverax/courier-studio-core/config";

import { absentImportCandidates } from "./absent-import-candidates";
import { readModuleImports } from "./read-module-imports";
import { resolveConfigImport } from "./resolve-config-import";

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
 * An import that should name a local file and names none yet is returned too,
 * as every absent path its module could be created at (see
 * `absentImportCandidates`), each with `null`: whoever evaluates the entries
 * next may find the module there, and whoever watches must then see it.
 *
 * One walk covers every entry: a module the config and the mocks file both
 * import is read once, and so are cycles.
 *
 * @param entries - Absolute paths to walk from, the config first
 * @returns Each module's absolute path and the sha256 of what was read
 *   (`"unreadable"` when it could not be), in walk order, each existing entry
 *   first among the modules it reached; then each absent path an unresolved
 *   import could name, with `null`. Empty when no entry exists
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
      if (resolved) walk(resolved, aliases);
      else for (const path of absentImportCandidates(fromDir, specifier, aliases)) absent.add(path);
    }
  };

  for (const entry of entries) walk(entry, readPathAliases(dirname(resolve(entry))));
  /* A module another import reached after an earlier one found it absent was
     read, and its hash stands. */
  const deps = new Map<string, string | null>(hashes);
  for (const path of absent) if (!deps.has(path)) deps.set(path, null);
  return deps;
}
