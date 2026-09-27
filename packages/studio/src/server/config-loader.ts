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
import { ConfigurationError } from "@noverax/courier";
import type { CourierConfig } from "@noverax/courier/config";
import { type AnySource, stampSourceKeys } from "@noverax/courier/define";
import type { TransformCache } from "@noverax/courier-studio-core/config";
import { findConfigFileAt } from "@noverax/courier-studio-core/config";
import { ConfigLoaderError, ConfigNotFoundError } from "./config-loader-errors";
import type { LoadedCourierMocks } from "./courier-mocks-file";
import {
  findCourierMocks,
  type LocatedCourierMocks,
  locateCourierMocks,
  readCourierMocks,
} from "./courier-mocks-file";
import type { EvaluatedCourierFiles } from "./evaluate-courier-files";
import { evaluateCourierFiles } from "./evaluate-courier-files";
import { hashStillOnDisk } from "./hash-still-on-disk";
import { messageOf } from "./message-of";
import { readEntryNames } from "./read-entry-names";
import type { ProjectInputs } from "./read-project-inputs";
import { readProjectInputs } from "./read-project-inputs";
import { studioTransformCache } from "./studio-transform-cache";
import { validateCourierConfig } from "./validate-courier-config";

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
   * entries included; every absent path an import that named no module could
   * name one at, so creating that module is noticed; and every name either
   * file may take in the project root, so creating one — or one that takes
   * precedence — is noticed. Suitable for `fs.watch` registration.
   */
  deps: string[];
  /**
   * Each path in `deps` with the hash of what it held when the load read it,
   * before evaluating anything: the sha256 of its bytes, `null` when it was
   * absent, `"unreadable"` when it could not be read. A path that holds
   * something else by the time it is watched changed while the load ran.
   */
  depHashes: ProjectInputs;
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
  /**
   * Handed what the load read, before it evaluates anything, so whoever
   * watches the project can watch it whatever the load's outcome, a load
   * that never finishes included. Not called when no config is found.
   */
  onInputs?: (inputs: ProjectInputs) => void;
}

/**
 * Load `courier.config.*` from `projectRoot`, and `courier.mocks.*` beside it.
 *
 * Validates that `sources` is a plain object of sources — an empty one
 * included, so a project that has no source yet loads, and can import its
 * first; see `validateCourierConfig` — stamps each source with its config
 * key (so the key acts as the canonical source name), and rejects silent
 * name collisions where the user passed a `defineApi` whose auto-derived
 * name already differs from the config key.
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
 * Every file the load depends on is read once before anything is evaluated —
 * each name the config or the mocks file may take before either is looked
 * for — and the hash of what it held is returned with it (`depHashes`), and
 * carried by every `ConfigLoaderError` thrown after that read. The mocks
 * file's hash is that one read's, so a save that lands at any moment of the
 * load leaves a file whose bytes differ from the ones recorded, unless a
 * second save restores them.
 *
 * @param projectRoot - The directory holding `courier.config.*`
 * @param options - Where transforms are reused (default: Studio's cache for
 *   the project), and who is handed what the load read before it evaluates
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
  { transformCache = studioTransformCache(projectRoot), onInputs }: LoadCourierConfigOptions = {},
): Promise<LoadedCourierConfig> {
  const root = realpathSync(projectRoot);
  const entryNames = readEntryNames(root);
  const found = findConfigFileAt(root);
  if (!found) throw new ConfigNotFoundError(projectRoot);
  const configFile = realpathSync(found);
  const foundMocks = findCourierMocks(root);
  const depHashes = readProjectInputs(entryNames, configFile, foundMocks.file);
  onInputs?.(depHashes);
  const mocks = locateCourierMocks(foundMocks, depHashes);

  let evaluated: EvaluatedCourierFiles;
  try {
    evaluated = await evaluateCourierFiles(configFile, loadable(mocks), transformCache);
  } catch (err) {
    throw new ConfigLoaderError(
      "CONFIG_INVALID",
      `Failed to load courier.config: ${messageOf(err)}`,
      { cause: err, context: { cwd: projectRoot }, depHashes },
    );
  }
  const { config } = evaluated;
  validateCourierConfig(config, configFile, depHashes);
  stampConfigSourceKeys(config.sources, configFile, depHashes);

  return {
    config,
    configFile,
    contentHash: hashStillOnDisk(configFile, depHashes.get(configFile)),
    deps: [...depHashes.keys()],
    depHashes,
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

/**
 * Stamp every `(key, source)` pair so the config key becomes the source's
 * canonical identifier, reporting a key that contradicts a name the author
 * chose as a config error of its own.
 */
function stampConfigSourceKeys(
  sources: Record<string, AnySource>,
  configFile: string,
  depHashes: ProjectInputs,
): void {
  try {
    stampSourceKeys(sources);
  } catch (err) {
    if (!(err instanceof ConfigurationError) || err.code !== "SOURCE_KEY_MISMATCH") throw err;
    throw new ConfigLoaderError("CONFIG_SOURCE_KEY_MISMATCH", err.message, {
      cause: err,
      context: { configFile },
      depHashes,
    });
  }
}

export type { ConfigLoaderErrorCode } from "./config-loader-errors";
export { ConfigLoaderError, ConfigNotFoundError } from "./config-loader-errors";
export type { LoadedCourierMocks } from "./courier-mocks-file";
