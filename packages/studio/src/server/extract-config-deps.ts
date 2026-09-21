import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { readPathAliases } from "@noverax/courier-studio-core/config";

import { readImportSpecifiers } from "./read-import-specifiers";
import { resolveConfigImport } from "./resolve-config-import";

/**
 * Walk a config file and return every local TypeScript/JavaScript module it
 * transitively imports.
 *
 * Relative and absolute specifiers are followed directly; a bare one is
 * followed only when the project's tsconfig `paths` maps it to a file of its
 * own, which is how a config that imports `@/lib/sources` or `@shared/api`
 * still yields the modules behind those names. Everything else — a package, a
 * node builtin — is left alone. Cycles are tolerated via a visited set.
 *
 * The result always contains `entryFile` as the first element so callers can
 * pass it directly to a watcher without an extra concat.
 *
 * @param entryFile - Absolute path to the config file to walk from
 * @returns Absolute paths, entry file first, empty when it does not exist
 *
 * @example
 * ```ts
 * extractConfigDeps("/app/courier.config.ts");
 * // → ["/app/courier.config.ts", "/app/src/lib/sources.ts"]
 * ```
 */
export function extractConfigDeps(entryFile: string): string[] {
  const visited = new Set<string>();
  const order: string[] = [];
  const aliases = readPathAliases(dirname(resolve(entryFile)));

  const walk = (file: string): void => {
    const normalized = resolve(file);
    if (visited.has(normalized)) return;
    if (!existsSync(normalized)) return;
    visited.add(normalized);
    order.push(normalized);

    for (const specifier of readImportSpecifiers(normalized)) {
      const resolved = resolveConfigImport(dirname(normalized), specifier, aliases);
      if (resolved) walk(resolved);
    }
  };

  walk(entryFile);
  return order;
}
