/**
 * Studio dev-server config loader.
 *
 * Finds `courier.config.*` in the project root with the shared loader of
 * `@noverax/courier-studio-core`, so Studio and the app's runtime resolve the
 * config the same way, and loads `courier.mocks.*` beside it, which only
 * Studio reads. On top of that it reports a missing config loudly, checks the
 * config's shape, stamps each source with its config key, and lists every
 * module both files import for the dependency watcher.
 */

import { realpathSync } from "node:fs";
import { join } from "node:path";
import { ConfigurationError, createLogger } from "@noverax/courier";
import type { CourierConfig } from "@noverax/courier/config";
import { type AnySource, stampSourceKeys } from "@noverax/courier/define";
import type { TransformCache } from "@noverax/courier-studio-core/config";
import {
  CONFIG_BASENAMES,
  findConfigFileAt,
  MOCKS_BASENAMES,
} from "@noverax/courier-studio-core/config";
import { ConfigLoaderError, ConfigNotFoundError } from "./config-loader-errors";
import type { LoadedCourierMocks } from "./courier-mocks-file";
import {
  type LocatedCourierMocks,
  locateCourierMocks,
  readCourierMocks,
} from "./courier-mocks-file";
import type { EvaluatedCourierFiles } from "./evaluate-courier-files";
import { evaluateCourierFiles } from "./evaluate-courier-files";
import { extractConfigDeps } from "./extract-config-deps";
import { hashFile } from "./file-hash";
import { messageOf } from "./message-of";
import { studioTransformCache } from "./studio-transform-cache";

const log = createLogger("Studio");

/** Result returned by `loadCourierConfig` */
export interface LoadedCourierConfig {
  /** Resolved config object after defaults/overrides */
  config: CourierConfig;
  /** Absolute path of the loaded `courier.config.*` file */
  configFile: string;
  /** sha256 of the config bytes that were loaded; `null` when the file changed while loading. */
  contentHash: string | null;
  /**
   * Every module the config and the mocks file transitively import, both
   * entries included, and every name either file may take in the project
   * root, so creating one — or one that takes precedence — is noticed.
   * Suitable for `fs.watch` registration.
   */
  deps: string[];
  /** The mocks Studio runs, from `courier.mocks.*` beside the config. */
  mocks: LoadedCourierMocks;
}

/** How `loadCourierConfig` transforms the project's modules. */
export interface LoadCourierConfigOptions {
  /**
   * Where each module's transform is reused while its bytes are unchanged.
   * Defaults to Studio's cache for the project, shared by every load in the
   * process; see `studioTransformCache`.
   */
  transformCache?: TransformCache;
}

/**
 * Load `courier.config.*` from `projectRoot`, and `courier.mocks.*` beside it.
 *
 * Validates that `sources` is a non-empty record, stamps each source with its
 * config key (so the key acts as the canonical source name), and rejects
 * silent name collisions where the user passed a `defineApi` whose
 * auto-derived name already differs from the config key.
 *
 * The config, the mocks file, every module they import that the loader
 * transpiles, and every JSON module either one reads are read and evaluated
 * again on every load; only a transform is reused, and only while its
 * module's bytes are the same, so an edit to any of them is seen. What the
 * loader hands to Node stays as Node first ran it until the process
 * restarts: a JavaScript module they import — `.mjs`, `.cjs`, a `.js` one in
 * a `"type": "module"` package, or a CommonJS `.js` one — and every module
 * but JSON that a CommonJS config or mocks file requires, TypeScript and ES
 * modules included. A CommonJS config or mocks file itself is run afresh;
 * see `loadCourierEntry`.
 *
 * @param projectRoot - The directory holding `courier.config.*`
 * @param options - Where transforms are reused (default: Studio's cache for
 *   the project)
 * @returns The config, its mocks file, and every file either one imports
 * @throws `ConfigNotFoundError` when no config file is found at
 *   `projectRoot`, and `ConfigLoaderError` for every other failure
 * @example
 * ```ts
 * const { config, deps } = await loadCourierConfig(projectRoot);
 * ```
 */
export async function loadCourierConfig(
  projectRoot: string,
  { transformCache = studioTransformCache(projectRoot) }: LoadCourierConfigOptions = {},
): Promise<LoadedCourierConfig> {
  const root = realpathSync(projectRoot);
  const found = findConfigFileAt(root);
  if (!found) throw new ConfigNotFoundError(projectRoot);
  const configFile = realpathSync(found);
  const mocks = locateCourierMocks(root);
  const mocksFile = loadable(mocks);
  const configHash = hashIfReadable(configFile);

  let evaluated: EvaluatedCourierFiles;
  try {
    evaluated = await evaluateCourierFiles(configFile, mocksFile, transformCache);
  } catch (err) {
    throw new ConfigLoaderError(
      "CONFIG_INVALID",
      `Failed to load courier.config: ${messageOf(err)}`,
      {
        cause: err,
        context: { cwd: projectRoot },
      },
    );
  }
  const { config } = evaluated;
  validateConfig(config, configFile);
  stampConfigSourceKeys(config.sources, configFile);

  return {
    config,
    configFile,
    contentHash:
      configHash !== null && hashIfReadable(configFile) === configHash ? configHash : null,
    deps: dependenciesOf(root, configFile, mocksFile),
    mocks: readCourierMocks(mocks, evaluated),
  };
}

/* A mocks file that is missing behind a link, or cannot be read, is not
   loaded: the config loads alone, and the mocks part says why. One that is
   loaded goes by its resolved path, as the config does, and so does the
   walk of what it imports. */
function loadable(mocks: LocatedCourierMocks): string | null {
  return mocks.unreadable !== null ? null : mocks.file;
}

/* An unreadable config fails its load with the loader's own message; its
   hash only tells a change during the load apart. */
function hashIfReadable(file: string): string | null {
  try {
    return hashFile(file);
  } catch (error) {
    log.debug(`${file} could not be hashed`, error);
    return null;
  }
}

/* Every name either file may take in the root is watched too, present or
   not: creating one, or one that takes precedence over the file loaded, must
   reload, and nothing Studio imports would otherwise point at it. */
function dependenciesOf(root: string, configFile: string, mocksFile: string | null): string[] {
  const mocksDeps = mocksFile === null ? [] : extractConfigDeps(mocksFile);
  const names = [...CONFIG_BASENAMES, ...MOCKS_BASENAMES].map((name) => join(root, name));
  return [...new Set([...extractConfigDeps(configFile), ...mocksDeps, ...names])];
}

/** Reject configs missing `sources` or with malformed entries */
function validateConfig(config: unknown, configFile: string): asserts config is CourierConfig {
  const invalid = (message: string) =>
    new ConfigLoaderError("CONFIG_INVALID", message, { context: { configFile } });
  if (!config || typeof config !== "object") throw invalid("courier.config must export an object");
  const sources = (config as CourierConfig).sources;
  if (!sources || typeof sources !== "object") throw invalid("courier.config.sources is required");
  if (Object.keys(sources).length === 0) {
    throw invalid("courier.config.sources must contain at least one entry");
  }
  /* A named import misspelled, or one its module stopped exporting, is
     `undefined` here rather than an error of the import itself. */
  const entries: Array<[string, unknown]> = Object.entries(sources);
  for (const [key, source] of entries) {
    if (typeof source === "object" && source !== null) continue;
    const found = source === undefined || source === null ? String(source) : `a ${typeof source}`;
    throw invalid(
      `courier.config.sources.${key} is ${found}, not a source; check that it is imported by the name its module exports`,
    );
  }
}

/**
 * Stamp every `(key, source)` pair so the config key becomes the source's
 * canonical identifier, reporting a key that contradicts a name the author
 * chose as a config error of its own.
 */
function stampConfigSourceKeys(sources: Record<string, AnySource>, configFile: string): void {
  try {
    stampSourceKeys(sources);
  } catch (err) {
    if (!(err instanceof ConfigurationError) || err.code !== "SOURCE_KEY_MISMATCH") throw err;
    throw new ConfigLoaderError("CONFIG_SOURCE_KEY_MISMATCH", err.message, {
      cause: err,
      context: { configFile },
    });
  }
}

export type { ConfigLoaderErrorCode } from "./config-loader-errors";
export { ConfigLoaderError, ConfigNotFoundError } from "./config-loader-errors";
export type { LoadedCourierMocks } from "./courier-mocks-file";
