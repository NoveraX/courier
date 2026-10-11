import { dirname, sep } from "node:path";
import { createLogger } from "@noverax/courier";
import type { CourierConfig } from "@noverax/courier/config";

import { followConfigFiles } from "./follow-config-files";
import { loadCourierConfigFile } from "./load-config";
import { createTransformCache } from "./transform-cache";
import { findTransformCacheDirectory } from "./transform-cache-directory";

const log = createLogger("Runtime");

/** What reloading a config on a save is told, and how it stops. */
export interface ReloadOnSave {
  /** Stop following the config's files. */
  close(): void;
}

/**
 * Load the config again whenever a file it depends on is saved — the
 * config, or a module of the project it reaches — for a process that has
 * no dev server to redefine its sources, such as the MCP server in an
 * editor. A module whose bytes did not change is not transformed again;
 * saves in quick succession are one reload; one that arrives while a
 * reload runs is taken right after it. A config a save breaks is logged,
 * and the last good one stays.
 *
 * @param configFile - The config, links resolved
 * @param modules - The files the first load evaluated
 * @param reloaded - Handed each config a save brings
 * @returns How to stop
 * @example
 * ```ts
 * reloadOnSave(loaded.configFile, modules, (config) => registerSources(config.sources));
 * ```
 */
export function reloadOnSave(
  configFile: string,
  modules: ReadonlySet<string>,
  reloaded: (config: CourierConfig) => void,
): ReloadOnSave {
  const transformCache = createTransformCache({
    directory: findTransformCacheDirectory(dirname(configFile)),
  });
  let followed = projectFiles(configFile, modules);
  let running = false;
  let again = false;

  async function reload(): Promise<void> {
    if (running) {
      again = true;
      return;
    }
    running = true;
    const evaluated = new Set<string>();
    try {
      const loaded = await loadCourierConfigFile(configFile, {
        transformCache,
        onModule: (file) => evaluated.add(file),
      });
      followed = projectFiles(configFile, evaluated);
      reloaded(loaded.config);
    } catch (error) {
      /* What the broken save reached is followed too, so the save that mends it reloads. */
      followed = new Set([...followed, ...projectFiles(configFile, evaluated)]);
      log.error("courier.config could not be reloaded; the config loaded before stays", error);
    } finally {
      follower.track(followed);
      running = false;
    }
    if (again) {
      again = false;
      await reload();
    }
  }

  const follower = followConfigFiles(() => void reload());
  follower.track(followed);
  return { close: () => follower.close() };
}

/* The config and the project's own modules it reached: a package under node_modules changes when it is installed, not saved. */
function projectFiles(configFile: string, modules: Iterable<string>): Set<string> {
  const files = new Set([configFile]);
  for (const file of modules) if (!file.includes(`${sep}node_modules${sep}`)) files.add(file);
  return files;
}
