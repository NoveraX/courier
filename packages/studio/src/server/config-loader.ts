/**
 * Studio dev-server config loader.
 *
 * Delegates the "find + load" step to the canonical shared loader in
 * `@noverax/courier-studio-core/runtime` so the Studio dev server and the
 * user-app runtime resolve `courier.config.*` through exactly the same code
 * path. This module layers dev-server-only concerns on top of the base
 * loader:
 *
 *  - Loud `ConfigNotFoundError` when no file is found at `projectRoot`
 *    (the runtime caller would have returned `null` instead)
 *  - `validateConfig` — asserts `sources` is a non-empty record
 *  - `stampSourceKeys` — stamps the config key onto each source as its
 *    canonical name, rejecting silent collisions with `defineApi({ name })`
 *  - `extractConfigDeps` — walks the transitive import graph for the
 *    `fs.watch` registration used by `config-watcher.ts`
 *
 * The base loader returns `LoadedCourierConfig` (`{ config, configFile }`);
 * this wrapper returns the same shape plus the `deps` field.
 */

import { ConfigurationError } from "@noverax/courier";
import type { CourierConfig } from "@noverax/courier/config";
import { type AnySource, stampSourceKeys } from "@noverax/courier/define";
import { loadCourierConfig as loadBase } from "@noverax/courier-studio-core/config";
import { ConfigLoaderError, ConfigNotFoundError } from "./config-loader-errors";
import { extractConfigDeps } from "./extract-config-deps";

/** Result returned by `loadCourierConfig` */
export interface LoadedCourierConfig {
  /** Resolved config object after defaults/overrides */
  config: CourierConfig;
  /** Absolute path of the loaded `courier.config.*` file */
  configFile: string;
  /**
   * Every TypeScript/JavaScript module the config transitively imports,
   * including the config file itself. Suitable for `fs.watch` registration.
   */
  deps: string[];
}

/**
 * Load `courier.config.{ts,js,mjs}` from `projectRoot`.
 *
 * Validates that `sources` is a non-empty record, stamps each source with its
 * config key (so the key acts as the canonical source name), and rejects
 * silent name collisions where the user passed a `defineApi` whose
 * auto-derived name already differs from the config key.
 *
 * Throws `ConfigNotFoundError` when no config file is found at `projectRoot`,
 * and `ConfigLoaderError` for every other validation failure.
 */
export async function loadCourierConfig(projectRoot: string): Promise<LoadedCourierConfig> {
  let loaded: Awaited<ReturnType<typeof loadBase>>;
  try {
    loaded = await loadBase({ cwd: projectRoot, requireAtCwd: true });
  } catch (err) {
    throw new ConfigLoaderError(
      "CONFIG_INVALID",
      `Failed to load courier.config: ${describe(err)}`,
      {
        cause: err,
        context: { cwd: projectRoot },
      },
    );
  }

  if (!loaded) throw new ConfigNotFoundError(projectRoot);

  const { config, configFile } = loaded;
  validateConfig(config, configFile);
  stampConfigSourceKeys(config.sources, configFile);

  return {
    config,
    configFile,
    deps: extractConfigDeps(configFile),
  };
}

/** Reject configs missing `sources` or with malformed entries */
function validateConfig(
  config: CourierConfig | undefined | null,
  configFile: string,
): asserts config is CourierConfig {
  if (!config || typeof config !== "object") {
    throw new ConfigLoaderError("CONFIG_INVALID", `courier.config must export an object`, {
      context: { configFile },
    });
  }
  const sources = (config as CourierConfig).sources;
  if (!sources || typeof sources !== "object") {
    throw new ConfigLoaderError("CONFIG_INVALID", `courier.config.sources is required`, {
      context: { configFile },
    });
  }
  if (Object.keys(sources).length === 0) {
    throw new ConfigLoaderError(
      "CONFIG_INVALID",
      `courier.config.sources must contain at least one entry`,
      {
        context: { configFile },
      },
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

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export type { ConfigLoaderErrorCode } from "./config-loader-errors";
export { ConfigLoaderError, ConfigNotFoundError } from "./config-loader-errors";
