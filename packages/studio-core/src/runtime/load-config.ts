/**
 * Unified `courier.config.{ts,mts,cts,js,mjs,cjs}` loader — the single
 * canonical way to resolve and load a user's config file.
 *
 * Two-stage design:
 *
 *  1. **File discovery** — walk up from `cwd` looking for a
 *     `courier.config.*` file, using nothing but Node builtins.
 *
 *  2. **File loading** — `jiti` imports the file, transpiling a TypeScript
 *     config transparently across Node / Next.js dev / tsx / bun / deno and
 *     resolving the project's `tsconfig` path aliases.
 *
 * This module lives in `@noverax/courier-studio-core` so BOTH consumers
 * resolve config through the same code path:
 *
 *  - The Studio dev server (`@noverax/courier-studio`) wraps this loader in
 *    `packages/studio/src/server/config-loader.ts` and adds dev-only
 *    concerns on top (validation, source-key stamping, dependency
 *    extraction for the fs watcher, rich error reporting).
 *
 *  - The user-app runtime (`attachRuntime` on the server side) calls this
 *    loader directly to discover + register sources without requiring the
 *    user to import the config file manually.
 *
 * A missing config is not an error: `null` lets the runtime caller fall back
 * to adapter auto-discovery. A config that exists and cannot be loaded is a
 * different thing entirely and throws, because reporting it as "no config"
 * sends the reader looking for a file that is right where they left it.
 */

import { existsSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { CourierConfig } from "@noverax/courier/config";
import { readPathAliases } from "./path-aliases";

export { type PathAliases, readPathAliases } from "./path-aliases";

const CONFIG_BASENAMES: ReadonlyArray<string> = [
  "courier.config.ts",
  "courier.config.mts",
  "courier.config.cts",
  "courier.config.js",
  "courier.config.mjs",
  "courier.config.cjs",
];

/**
 * Result of a successful `loadCourierConfig` call.
 *
 * `configFile` is the absolute, symlink-resolved path of the file that
 * was loaded — the dev-server side uses it for the `fs.watch` dep tracker;
 * the runtime side uses it only for log/debug output.
 */
export interface LoadedCourierConfig {
  config: CourierConfig;
  configFile: string;
}

/**
 * Options for `loadCourierConfig`.
 */
export interface LoadCourierConfigOptions {
  /**
   * Starting directory for the config search. Defaults to `process.cwd()`.
   * The dev-server passes the explicit project root; the runtime path
   * passes `process.cwd()` so the walk-up finds configs located at the
   * workspace root from a nested package cwd (common in monorepos).
   */
  cwd?: string;
  /**
   * When true, skip the walk-up and require the config file to exist at
   * exactly `cwd`. The dev-server uses this because it was told the
   * project root explicitly and wants to distinguish "no config in root"
   * from "config found higher up" (which would usually mean the user
   * pointed at the wrong directory). The runtime path leaves this false
   * so a nested `cwd` still discovers a root-level config.
   *
   * Defaults to false (walk up).
   */
  requireAtCwd?: boolean;
}

/**
 * Walk up from `startDir` looking for a `courier.config.*` file. Returns the
 * absolute directory containing the first match, or `null` if the walk
 * reaches the filesystem root without finding one.
 */
function findConfigFile(startDir: string): string | null {
  let dir = resolve(startDir);
  while (true) {
    for (const basename of CONFIG_BASENAMES) {
      const candidate = resolve(dir, basename);
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Check that `cwd` itself contains a config file, without walking up.
 */
function configFileAt(cwd: string): string | null {
  for (const basename of CONFIG_BASENAMES) {
    const candidate = resolve(cwd, basename);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Find and load a `courier.config.*` file.
 *
 * Returns `null` when no config file exists, so a caller can fall back.
 * Throws when a file was found and loading it failed, reporting what the
 * loader reported — for a TypeScript config, usually an unresolvable import.
 */
export async function loadCourierConfig(
  options: LoadCourierConfigOptions = {},
): Promise<LoadedCourierConfig | null> {
  const startDir = resolve(options.cwd ?? process.cwd());

  const found = options.requireAtCwd ? configFileAt(startDir) : findConfigFile(startDir);
  if (!found) return null;

  /* Resolve symlinks so downstream consumers — the dev server's dependency
     watcher above all — observe the canonical path. */
  const configFile = realpathSync(found);

  /* jiti is loaded here rather than at the top of the file so a bundler that
     merely reaches this module does not pull a TypeScript transpiler into its
     graph; only a process that actually reads a config pays for it. */
  const { createJiti } = await import("jiti");

  /* Both caches are off because this loader is also the reload path: the dev
     server calls it again on every edit, and a cached module would hand back
     the config as it was before the user changed it. */
  const jiti = createJiti(configFile, {
    alias: readPathAliases(dirname(configFile)).loader,
    interopDefault: true,
    moduleCache: false,
    fsCache: false,
  });

  /* A throw here is jiti reporting why a config it found will not load —
     usually an import it could not resolve. It carries the only useful
     detail, so it propagates as-is rather than being re-wrapped. */
  const config = await jiti.import<CourierConfig>(configFile, { default: true });

  return { config, configFile };
}
