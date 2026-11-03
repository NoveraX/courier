import { realpathSync } from "node:fs";
import { basename } from "node:path";

import type { RoutesFile } from "../routes-file/routes-file";
import { ROUTES_SPECIFIER } from "../util/routes-module-id";
import type { MetroResolution, MetroResolutionContext, MetroResolver } from "./metro-config-shape";

/* What Expo names a server's bundle: its API routes, and React Server Components. */
const SERVER_ENVIRONMENTS = new Set(["node", "react-server"]);

/**
 * The resolver Metro runs first: `@noverax/courier/routes` resolves to the
 * module the routes are written in, and every other module as the app's own
 * resolver, or Metro's, resolves it. A build fails there while the routes
 * cannot be read, with why; a development bundle takes the module, which
 * says why where it is imported. A module of the app's bundle that resolves
 * to the config fails it, as the config would ship the server's settings
 * and every API's definition in the app; a server's bundle may take it.
 *
 * @param routes - The project's routes
 * @param own - The resolver the config had, if any
 * @returns The resolver
 * @example
 * ```ts
 * const resolver = { ...config.resolver, resolveRequest: routesResolver(routes, config.resolver?.resolveRequest) };
 * ```
 */
export function routesResolver(
  routes: RoutesFile,
  own: MetroResolver | null | undefined,
): MetroResolver {
  return (context, moduleName, platform) => {
    if (moduleName === ROUTES_SPECIFIER) {
      if (!context.dev && routes.failure !== undefined) throw routes.failure;
      return { type: "sourceFile", filePath: routes.file };
    }
    const resolution = (own ?? context.resolveRequest)(context, moduleName, platform);
    refuseConfigInApp(routes, context, resolution);
    return resolution;
  };
}

function refuseConfigInApp(
  routes: RoutesFile,
  context: MetroResolutionContext,
  resolution: MetroResolution,
): void {
  const configFile = routes.configFile;
  const filePath = resolution.filePath;
  if (configFile === undefined || filePath === undefined || isServer(context)) return;
  /* By name first: most modules are not the config, and their real path is not looked up. */
  if (basename(filePath) !== basename(configFile) || realOf(filePath) !== configFile) return;
  throw new Error(
    `[courier] ${basename(configFile)} is imported into the app's bundle as a value, by ${context.originModulePath}: it would ship the server's settings and every API's definition in the app. Import its type alone: write \`import type config from\` where the module writes \`import config from\`.`,
  );
}

function isServer(context: MetroResolutionContext): boolean {
  const environment = context.customResolverOptions?.environment;
  return typeof environment === "string" && SERVER_ENVIRONMENTS.has(environment);
}

function realOf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}
