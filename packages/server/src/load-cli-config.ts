import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  type LoadedCourierConfig,
  loadCourierConfig,
  loadCourierConfigFile,
  projectTransformCache,
} from "@noverax/courier-studio-core/config";

/** The config the CLI serves, or why it has none. */
export type CliConfig = LoadedCourierConfig | { problem: string };

/**
 * Load the config the CLI was pointed at: the `--config` path resolved against
 * the working directory, or a `courier.config.*` in it.
 *
 * It goes through the loader the rest of Courier uses, so a relative path
 * resolves against the working directory, not the CLI's install directory,
 * and a config importing its modules without extensions loads.
 *
 * @param cwd - The working directory.
 * @param file - The `--config` value, when given.
 * @returns The loaded config, or a problem to report.
 * @throws What the loader reported when a config exists and will not load.
 */
export async function loadCliConfig(cwd: string, file?: string): Promise<CliConfig> {
  const loaded = file === undefined ? await discover(cwd) : await named(cwd, file);
  if ("problem" in loaded) return loaded;
  const { sources } = loaded.config;
  if (!sources || typeof sources !== "object" || Object.keys(sources).length === 0) {
    return { problem: `${loaded.configFile} declares no sources to serve.` };
  }
  return loaded;
}

async function discover(cwd: string): Promise<CliConfig> {
  const loaded = await loadCourierConfig({
    cwd,
    requireAtCwd: true,
    projectTransforms: process.env.NODE_ENV !== "production",
  });
  return (
    loaded ?? {
      problem: `No courier.config.* in ${cwd}. Create one there, or pass --config <path>.`,
    }
  );
}

async function named(cwd: string, file: string): Promise<CliConfig> {
  const path = resolve(cwd, file);
  if (!existsSync(path)) return { problem: `--config ${file}: there is no file at ${path}.` };
  const transformCache =
    process.env.NODE_ENV === "production" ? undefined : projectTransformCache(dirname(path));
  return loadCourierConfigFile(path, { transformCache });
}
