/**
 * Unified `courier.config.{ts,mts,cts,js,mjs,cjs}` loader — the single
 * canonical way to resolve and load a user's config file.
 *
 * Two-stage design:
 *
 *  1. **File discovery** — walk up from `cwd` looking for a
 *     `courier.config.*` file. c12's own `loadConfig` does NOT walk up by
 *     default, so we implement the discovery layer ourselves in ~20 LOC
 *     of pure Node builtins.
 *
 *  2. **File loading** — once a file is found, hand its directory to
 *     `c12.loadConfig` which uses `jiti` under the hood to transpile
 *     TypeScript configs transparently across Node / Next.js dev / tsx /
 *     bun / deno.
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
 * Returning a nullable result (instead of throwing a dedicated error)
 * lets the runtime caller treat "no config found" as a soft-fail and
 * fall back to adapter auto-discovery. Dev-server callers that need
 * loud failure wrap the result and throw explicitly.
 */

import { existsSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { CourierConfig } from "@noverax/courier/config";
import { loadConfig } from "c12";

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
function findConfigDir(startDir: string): string | null {
  let dir = resolve(startDir);
  while (true) {
    for (const basename of CONFIG_BASENAMES) {
      if (existsSync(resolve(dir, basename))) return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Check that `cwd` itself contains a config file, without walking up.
 */
function hasConfigAt(cwd: string): boolean {
  return CONFIG_BASENAMES.some((name) => existsSync(resolve(cwd, name)));
}

/**
 * Find and load a `courier.config.*` file.
 *
 * Returns `null` on any failure mode (file not found, c12 throws, the
 * resolved config is empty). Callers that need loud failure check for
 * `null` and throw their own domain-specific error — this function
 * stays neutral so the dev-server and runtime paths can pick their own
 * error surfaces.
 */
export async function loadCourierConfig(
  options: LoadCourierConfigOptions = {},
): Promise<LoadedCourierConfig | null> {
  const startDir = resolve(options.cwd ?? process.cwd());

  const configDir = options.requireAtCwd
    ? hasConfigAt(startDir)
      ? startDir
      : null
    : findConfigDir(startDir);

  if (!configDir) return null;

  let loaded: Awaited<ReturnType<typeof loadConfig<CourierConfig>>>;
  try {
    loaded = await loadConfig<CourierConfig>({
      name: "courier",
      cwd: configDir,
      rcFile: false,
      packageJson: false,
      dotenv: false,
      globalRc: false,
    });
  } catch {
    return null;
  }

  const configFile = loaded.configFile;
  if (!configFile || !loaded.config) return null;

  // c12 occasionally returns a placeholder `configFile: "courier.config"`
  // when nothing was actually loaded. Treat that as a null result so the
  // caller's fallback path runs cleanly.
  if (!existsSync(configFile)) return null;

  return {
    config: loaded.config,
    // Resolve symlinks so tests (and downstream consumers like
    // `extractConfigDeps`) observe the canonical path — avoids the
    // macOS `/var` → `/private/var` discrepancy.
    configFile: realpathSync(configFile),
  };
}
