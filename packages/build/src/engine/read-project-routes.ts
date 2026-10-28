import { createRequire } from "node:module";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import type { CourierRoutes } from "@noverax/courier/define";
import type { routesOf } from "@noverax/courier/internal";
import type { LoadedCourierConfig } from "../config/load-config";
import { isRecord } from "../util/is-record";
import { loadProjectConfig, projectConfigFile } from "./project-config";
import { readEnvFiles } from "./read-env-files";
import { RoutesReadError } from "./routes-read-error";
import type { RoutesInputs, RoutesRequest, RoutesSnapshot } from "./routes-snapshot";
import { trackReading } from "./track-reading";

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
 * @throws RoutesReadError `CONFIG_NOT_FOUND` with no config to read,
 *   `CONFIG_NOT_TRUSTED` for one someone else could have put above the root,
 *   and `CONFIG_NOT_LOADED` for one that would not load or holds no
 *   `sources`; each names what the reading had read, which may mend it
 * @example
 * ```ts
 * const { routes } = await readProjectRoutes({ root: "/app", envFiles: ["/app/.env"] });
 * ```
 */
export async function readProjectRoutes(request: RoutesRequest): Promise<RoutesSnapshot> {
  readEnvFiles(request.envFiles);
  const reading = trackReading(request);
  try {
    const { configFile, lookedFor } = projectConfigFile(request);
    reading.noteConfig(configFile, lookedFor);
    const loaded = await loadProjectConfig(configFile, request, reading.loadOptions);
    reading.noteConfig(loaded.configFile, lookedFor);
    const routes = await routesOfSources(loaded, request.root);
    return { ...(await reading.inputs()), configFile: loaded.configFile, routes };
  } catch (error) {
    throw withInputs(error, await reading.inputs(), request);
  }
}

/* Each source's routes, by name, read by the core the project's config was written with. */
async function routesOfSources(
  loaded: LoadedCourierConfig,
  root: string,
): Promise<Record<string, CourierRoutes>> {
  const sources = sourcesOf(loaded, root);
  const read = await projectRoutesOf(loaded.configFile, root);
  const routes: Record<string, CourierRoutes> = {};
  for (const name of Object.keys(sources).sort(byCodeUnits)) {
    routes[name] = read(sources[name] as object, name);
  }
  return routes;
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

/* The failure, naming what the reading had read: a change to any of it may mend the config. */
function withInputs(error: unknown, inputs: RoutesInputs, request: RoutesRequest): RoutesReadError {
  const stack = error instanceof Error ? error.stack : undefined;
  if (!(error instanceof RoutesReadError)) {
    return new RoutesReadError(
      "CONFIG_NOT_LOADED",
      `The routes a page takes were not read: ${error instanceof Error ? error.message : String(error)}`,
      { root: request.root, configFile: inputs.configFile },
      { stack, inputs },
    );
  }
  if (error.inputs !== undefined) return error;
  return new RoutesReadError(error.code, error.message, error.context, { stack, inputs });
}

function byCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
