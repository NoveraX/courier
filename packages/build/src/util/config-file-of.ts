import { realpathSync } from "node:fs";
import { resolve } from "node:path";

import { errnoCode } from "../config/errno-code";
import { findConfigFile } from "../config/load-config";
import { UntrustedConfigError } from "../config/untrusted-config-error";

/**
 * The config file the routes are read from, as a bundler names a module:
 * its real path. One that is not there yet, or that is not run, gives none
 * here; the engine reports why when the routes are read.
 *
 * @param root - The project's root, where the config is looked for and above
 * @param named - The config, from the root or absolute, when it is not the one found
 * @returns The config file, absolute and real; none when there is no config to read
 * @example
 * ```ts
 * configFileOf("/app"); // "/app/courier.config.ts"
 * ```
 */
export function configFileOf(root: string, named?: string | undefined): string | undefined {
  try {
    const file = named === undefined ? findConfigFile(root) : resolve(root, named);
    return file === null ? undefined : realpathSync(file);
  } catch (error) {
    if (error instanceof UntrustedConfigError || errnoCode(error) === "ENOENT") return undefined;
    throw error;
  }
}
