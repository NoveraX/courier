/**
 * Unified `courier.config.{ts,mts,cts,js,mjs,cjs}` loader — the single
 * canonical way to resolve and load a user's config file.
 *
 * Two-stage design:
 *
 *  1. **File discovery** — walk up from `cwd` to the top of the project
 *     looking for a `courier.config.*` file, using nothing but Node builtins.
 *
 *  2. **File loading** — `jiti` imports the file, transpiling a TypeScript
 *     config transparently across Node / Next.js dev / tsx / bun / deno and
 *     resolving the project's `tsconfig` path aliases.
 *
 * Every consumer resolves the config through this one code path:
 *
 *  - The Studio dev server (`@noverax/courier-studio`) wraps this loader and
 *    adds dev-only concerns on top (validation, source-key stamping,
 *    dependency extraction for the fs watcher, rich error reporting).
 *
 *  - The user-app runtime (`attachRuntime` on the server side) calls it
 *    directly to discover and register sources without requiring the user
 *    to import the config file manually.
 *
 *  - `courier-cli`, the standalone server and the MCP server load the
 *    project's config with it, and the bundler plugins read a page's routes
 *    from the config it loads.
 *
 * A missing config is not an error: `null` lets the runtime caller fall back
 * to adapter auto-discovery. A config that exists and cannot be loaded is a
 * different thing entirely and throws, because reporting it as "no config"
 * sends the reader looking for a file that is right where they left it.
 */

import { existsSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { CourierConfig } from "@noverax/courier/config";
import { assertOwnConfig } from "./assert-own-config";
import { CONFIG_BASENAMES, configCandidates } from "./config-candidates";
import type { ConfigJitiOptions } from "./config-jiti";
import { type ImportProjectFileOptions, importProjectFile } from "./import-project-file";
import { createTransformCache, type TransformCache } from "./transform-cache";
import { findTransformCacheDirectory } from "./transform-cache-directory";

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
  cwd?: string | undefined;
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
  requireAtCwd?: boolean | undefined;
  /**
   * Where to reuse each module's transform while its bytes are unchanged. A
   * caller that keeps one across loads transforms only the modules whose
   * bytes changed; without one, every module is transformed on every load.
   */
  transformCache?: TransformCache | undefined;
  /** Told the file of each module the load transforms; see `createConfigJiti`. */
  onModule?: ((filename: string) => void) | undefined;
  /**
   * Reuse the transforms kept in the project's `node_modules/.cache`, the
   * ones Studio keeps, and keep there the ones this load makes: a process
   * that loads the config beside Studio — an app that attaches, the MCP
   * server, `courier-server` — transforms only the modules no process has
   * transformed yet. On a project of a thousand endpoints that is hundreds
   * of modules, most of a second. Passed over when `transformCache` is given.
   */
  projectTransforms?: boolean | undefined;
  /**
   * How long the load may take before it is given up with `ConfigLoadError`
   * `LOAD_TIMED_OUT`, in milliseconds. The config's code runs on — nothing
   * stops a module's top-level code — so a process that gives up should
   * end. Left out, the load is waited for however long it takes.
   */
  timeoutMs?: number | undefined;
}

/**
 * Walk up from `startDir` looking for a `courier.config.*` file, up to the
 * top of the project: the folder that holds its repository or is the root
 * of its workspace (see {@link configCandidates}). A config found in a folder
 * above `startDir` is taken only when it belongs to this user or to the
 * owner of `startDir`, and no user outside its group may write it: a folder
 * many users share, such as `/tmp`, would otherwise run anyone's config.
 *
 * @param startDir - The directory to look in first
 * @returns The absolute path of the first match, or `null` when no directory
 *   up to the top of the project holds one
 * @throws UntrustedConfigError when the nearest config lies above `startDir`
 *   and someone else could have put it there
 * @example
 * ```ts
 * findConfigFile("/app/src"); // → "/app/courier.config.ts", or null
 * ```
 */
export function findConfigFile(startDir: string): string | null {
  const folder = resolve(startDir);
  const found = configCandidates(folder).find((candidate) => existsSync(candidate));
  if (found === undefined) return null;
  if (dirname(found) !== folder) assertOwnConfig(found, folder);
  return found;
}

/**
 * Find a config file in `cwd` itself, without walking up.
 *
 * @param cwd - The directory to look in
 * @returns The first of {@link CONFIG_BASENAMES} present there, or `null`
 * @example
 * ```ts
 * findConfigFileAt(process.cwd()); // → "/app/courier.config.ts", or null
 * ```
 */
export function findConfigFileAt(cwd: string): string | null {
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
 * Throws `ConfigLoadError` when a file was found and loading it failed,
 * saying why, where — the chain of imports — and what to do.
 *
 * @param options - Where to look, where to reuse transforms, and how long to wait
 * @returns The config and its canonical path, or `null` when there is no config
 * @example
 * ```ts
 * const loaded = await loadCourierConfig({ cwd: projectRoot, requireAtCwd: true });
 * ```
 */
export async function loadCourierConfig(
  options: LoadCourierConfigOptions = {},
): Promise<LoadedCourierConfig | null> {
  const startDir = resolve(options.cwd ?? process.cwd());

  const found = options.requireAtCwd ? findConfigFileAt(startDir) : findConfigFile(startDir);
  if (!found) return null;
  const transformCache =
    options.transformCache ??
    (options.projectTransforms === true ? projectTransformCache(dirname(found)) : undefined);
  return loadCourierConfigFile(found, {
    transformCache,
    onModule: options.onModule,
    timeoutMs: options.timeoutMs,
  });
}

/**
 * The transforms kept in a project's `node_modules/.cache` — the ones Studio
 * keeps — for a process that loads the project's modules once: it reuses
 * them, keeps there the ones it makes, and holds none in memory.
 *
 * @param projectRoot - The project's root
 * @returns The cache, or `undefined` when the project has no directory to keep them in
 * @example
 * ```ts
 * await loadCourierConfigFile(file, { transformCache: projectTransformCache(dirname(file)) });
 * ```
 */
export function projectTransformCache(projectRoot: string): TransformCache | undefined {
  const directory = findTransformCacheDirectory(projectRoot);
  return directory === null ? undefined : createTransformCache({ directory, maxMemoryChars: 0 });
}

/**
 * How one config file is loaded: the loader's options, what runs just before
 * the config's code does, and how long it may take; see `importProjectFile`.
 */
export interface LoadConfigFileOptions extends Omit<ImportProjectFileOptions, "default"> {}

/**
 * Load one config file, found by whatever means the caller chose — the
 * standalone server takes it from `--config`.
 *
 * @param file - Absolute path of an existing config file
 * @param options - How the loader resolves imports and where it reuses
 *   transforms, see {@link ConfigJitiOptions}, what runs before the config,
 *   and how long it may take
 * @returns The config and the canonical path it was loaded from
 * @throws ConfigLoadError when the file will not load: an import that does
 *   not resolve or that the framework refuses, a module that does not
 *   compile, or code that throws
 * @example
 * ```ts
 * const { config } = await loadCourierConfigFile("/app/courier.config.ts", {
 *   transformCache: createTransformCache(),
 * });
 * ```
 */
export async function loadCourierConfigFile(
  file: string,
  options: LoadConfigFileOptions = {},
): Promise<LoadedCourierConfig> {
  /* Resolve symlinks so downstream consumers — the dev server's dependency
     watcher above all — observe the canonical path. */
  const configFile = realpathSync(file);

  const config = await importProjectFile(configFile, { ...options, default: true });

  return { config: config as CourierConfig, configFile };
}
