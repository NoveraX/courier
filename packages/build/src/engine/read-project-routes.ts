import { createRequire } from "node:module";
import { basename, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import type { CourierRoutes } from "@noverax/courier/define";
import type { routesOf } from "@noverax/courier/internal";
import {
  findConfigFile,
  type LoadedCourierConfig,
  loadCourierConfigFile,
  projectTransformCache,
} from "../config/load-config";
import { isRecord } from "../util/is-record";
import { readEnvFiles } from "./read-env-files";
import { RoutesReadError } from "./routes-read-error";
import type { RoutesRequest, RoutesSnapshot } from "./routes-snapshot";
import { trackEnvReads } from "./track-env-reads";
import { trackModuleFiles } from "./track-module-files";

type RoutesOf = typeof routesOf;

/**
 * Read a project's routes from its config: its env files first, then the
 * config, every module it reaches transformed once and kept for the next
 * process, then each source's routes by the rules the proxy applies. Run in
 * a process of its own, which it leaves changed: `process.env` is watched,
 * and Node's resolution hooked.
 *
 * @param request - Where the project is, and which env files it reads
 * @returns The routes, and every file and variable they depended on
 * @throws RoutesReadError `CONFIG_NOT_FOUND` with no config to read, and
 *   `CONFIG_NOT_LOADED` for one that would not load or holds no `sources`
 * @example
 * ```ts
 * const { routes } = await readProjectRoutes({ root: "/app", envFiles: ["/app/.env"] });
 * ```
 */
export async function readProjectRoutes(request: RoutesRequest): Promise<RoutesSnapshot> {
  readEnvFiles(request.envFiles);
  const env = trackEnvReads();
  const modules = trackModuleFiles();
  const loaded = await loadConfig(request, modules.noteFile);
  const sources = sourcesOf(loaded, request.root);
  const read = await projectRoutesOf(loaded.configFile, request.root);
  const routes: Record<string, CourierRoutes> = {};
  for (const name of Object.keys(sources).sort(byCodeUnits)) {
    routes[name] = read(sources[name] as object, name);
  }
  const files = new Set([loaded.configFile, ...request.envFiles, ...modules.files()]);
  return { configFile: loaded.configFile, routes, files: [...files].sort(), env: env.names() };
}

/* The config the request names, or the one found from its root, loaded with the project's transforms. */
async function loadConfig(
  request: RoutesRequest,
  onModule: (file: string) => void,
): Promise<LoadedCourierConfig> {
  const configFile = request.configFile ?? findConfigFile(request.root);
  if (configFile === null) {
    throw new RoutesReadError(
      "CONFIG_NOT_FOUND",
      `No courier.config.* in ${request.root} or a folder above it: the routes a page takes are read from it. Name another file with the plugin's \`config\` option.`,
      { root: request.root },
    );
  }
  try {
    const transformCache = projectTransformCache(dirname(configFile));
    return await loadCourierConfigFile(configFile, { transformCache, onModule });
  } catch (error) {
    throw new RoutesReadError(
      "CONFIG_NOT_LOADED",
      `${basename(configFile)} did not load, so the routes a page takes were not read: ${messageOf(error)}`,
      { root: request.root, configFile },
      error instanceof Error ? error.stack : undefined,
    );
  }
}

/* The config's sources, held to being a record of APIs. */
function sourcesOf(loaded: LoadedCourierConfig, root: string): Record<string, unknown> {
  const sources: unknown = isRecord(loaded.config) ? loaded.config.sources : undefined;
  if (isRecord(sources)) return sources;
  throw new RoutesReadError(
    "CONFIG_NOT_LOADED",
    `${basename(loaded.configFile)} exports no \`sources\`: the routes a page takes are read from the APIs it names there.`,
    { root, configFile: loaded.configFile },
  );
}

/* `routesOf` of the core the project's config was written with, as its own folder resolves it. */
async function projectRoutesOf(configFile: string, root: string): Promise<RoutesOf> {
  const path = createRequire(configFile).resolve("@noverax/courier/internal");
  const core: { routesOf?: unknown } = await import(pathToFileURL(path).href);
  if (typeof core.routesOf === "function") return core.routesOf as RoutesOf;
  throw new RoutesReadError(
    "CONFIG_NOT_LOADED",
    `The @noverax/courier at ${path} reads no routes: update it to the version of @noverax/courier-build.`,
    { root, configFile },
  );
}

function byCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
