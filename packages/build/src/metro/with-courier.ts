import { isAbsolute, join, relative, resolve } from "node:path";

import { routesFile } from "../routes-file/routes-file";
import type { MetroConfigShape } from "./metro-config-shape";
import type { MetroRoutesOptions } from "./metro-routes-options";
import { routesResolver } from "./routes-resolver";

/* Where the module is written by default: a cache folder of the app's own, which Metro watches. */
const OUT_DIR = join("node_modules", ".cache", "@noverax", "courier");

/* How the app names another folder for it, should that one not take it. */
const ELSEWHERE = "withCourier(config, { outDir })";

/**
 * Have Metro — under Expo or React Native's CLI — bundle the routes a
 * proxy client may call from `courier.config.ts`, in place of the module
 * `@noverax/courier/routes` ships. The routes are read before Metro starts
 * and written to a module of the app's own, which a dev server keeps
 * current: a change to anything they came from reads them again, and Metro
 * bundles the module anew. The routes carry no address, path or
 * middleware. A bundle of the app that takes the config itself fails.
 *
 * A build fails while the routes cannot be read, with why; a development
 * bundle keeps the routes read last, and with none read yet, the module
 * fails where it is imported, saying why.
 *
 * @param config - The Metro config, as `getDefaultConfig()` gives it, or a promise of it
 * @param options - Where the config is, and where the module is written
 * @returns The config, with the resolver that answers the routes
 * @throws RoutesReadError `ROUTES_NOT_WRITTEN` when the module's folder cannot be written
 * @example
 * ```js
 * // metro.config.js
 * const { getDefaultConfig } = require("expo/metro-config");
 * const { withCourier } = require("@noverax/courier-build/metro");
 *
 * module.exports = withCourier(getDefaultConfig(__dirname));
 * ```
 */
export async function withCourier<TConfig extends MetroConfigShape>(
  config: TConfig | Promise<TConfig>,
  options: MetroRoutesOptions = {},
): Promise<TConfig & MetroConfigShape> {
  const resolved = await config;
  const root = resolved.projectRoot ?? process.cwd();
  const folder = resolve(root, options.outDir ?? OUT_DIR);
  const routes = await routesFile(root, options.config, join(folder, "routes.js"), ELSEWHERE);
  const watchFolders = resolved.watchFolders ?? [];
  const watched = [root, ...watchFolders].some((parent) => isWithin(parent, folder));
  return {
    ...resolved,
    watchFolders: watched ? watchFolders : [...watchFolders, folder],
    resolver: {
      ...resolved.resolver,
      resolveRequest: routesResolver(routes, resolved.resolver?.resolveRequest),
    },
  };
}

function isWithin(parent: string, path: string): boolean {
  const from = relative(resolve(parent), path);
  return from === "" || (!from.startsWith("..") && !isAbsolute(from));
}
