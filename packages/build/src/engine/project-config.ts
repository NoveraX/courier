import { basename, dirname } from "node:path";

import { configCandidates } from "../config/config-candidates";
import {
  findConfigFile,
  type LoadConfigFileOptions,
  type LoadedCourierConfig,
  loadCourierConfigFile,
  projectTransformCache,
} from "../config/load-config";
import { ConfigLoadError } from "../config/load-error/config-load-error";
import { UntrustedConfigError } from "../config/untrusted-config-error";
import { RoutesReadError, type RoutesReadErrorCode } from "./routes-read-error";
import type { RoutesRequest } from "./routes-snapshot";

/** The config a reading of the routes reads, and where one was looked for first. */
export interface ProjectConfigFile {
  /** The config, absolute. */
  readonly configFile: string;
  /** Where a config was looked for before it and was not there: one saved there would be read instead. */
  readonly lookedFor: readonly string[];
}

/**
 * The config a reading of the routes reads: the one the request names, or
 * the nearest found from its root, up to the top of the project.
 *
 * @param request - Where the project is, and the config it names
 * @returns The config, and where one was looked for first
 * @throws RoutesReadError `CONFIG_NOT_FOUND` with no config up to the top of
 *   the project, and `CONFIG_NOT_TRUSTED` for one above the root that someone
 *   else could have put there; either names every path looked at
 * @example
 * ```ts
 * projectConfigFile({ root: "/app/web", envFiles: [] });
 * // → { configFile: "/app/courier.config.ts", lookedFor: ["/app/web/courier.config.ts", …] }
 * ```
 */
export function projectConfigFile(request: RoutesRequest): ProjectConfigFile {
  if (request.configFile !== undefined) return { configFile: request.configFile, lookedFor: [] };
  const candidates = configCandidates(request.root);
  const unread = (code: RoutesReadErrorCode, message: string, configFile?: string) =>
    new RoutesReadError(
      code,
      message,
      { root: request.root, configFile },
      { inputs: { files: [...candidates].sort(), env: [] } },
    );
  let found: string | null;
  try {
    found = findConfigFile(request.root);
  } catch (error) {
    if (!(error instanceof UntrustedConfigError)) throw error;
    throw unread("CONFIG_NOT_TRUSTED", error.message, error.context.configFile);
  }
  if (found === null) {
    throw unread(
      "CONFIG_NOT_FOUND",
      `No courier.config.* in ${request.root} or a folder above it, up to the top of the project: the routes a page takes are read from it. Name another file with the plugin's \`config\` option.`,
    );
  }
  return { configFile: found, lookedFor: candidates.slice(0, candidates.indexOf(found)) };
}

/**
 * Load the project's config with the project's transforms, kept in its
 * `node_modules/.cache` for the next reading.
 *
 * @param configFile - The config, absolute
 * @param request - Where the project is
 * @param options - What runs around the config's code
 * @returns The config, and its real path
 * @throws RoutesReadError `CONFIG_NOT_LOADED` with what the loader or the config threw
 * @example
 * ```ts
 * const loaded = await loadProjectConfig("/app/courier.config.ts", request, { onModule });
 * ```
 */
export async function loadProjectConfig(
  configFile: string,
  request: RoutesRequest,
  options: Omit<LoadConfigFileOptions, "transformCache">,
): Promise<LoadedCourierConfig> {
  try {
    const transformCache = projectTransformCache(dirname(configFile));
    return await loadCourierConfigFile(configFile, { ...options, transformCache });
  } catch (error) {
    const said =
      error instanceof ConfigLoadError
        ? `${error.message} ${error.hint}`
        : error instanceof Error
          ? error.message
          : String(error);
    const message = `${basename(configFile)} did not load, so the routes a page takes were not read: ${said}`;
    const cause: unknown = error instanceof ConfigLoadError ? error.cause : error;
    throw new RoutesReadError(
      "CONFIG_NOT_LOADED",
      message,
      { root: request.root, configFile },
      { stack: cause instanceof Error ? cause.stack : undefined },
    );
  }
}
