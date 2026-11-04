import { basename } from "node:path";
import type { LoadedForRoutes } from "@noverax/courier-cli/devkit";
import { routesModulePath } from "@noverax/courier-cli/devkit";
import type { GenerateOptions } from "../../apis/generator";

/**
 * Generation options that put the proxy caller's import of its routes where
 * the config puts the routes module — or, where the config keeps none, as a
 * project whose build has Courier's plugin does, that take them from
 * `@noverax/courier/routes` and register the config. Options without a
 * proxy caller, and a project with no config running yet, are left as they
 * are: the generator then takes the module beside the config, as a config
 * would put it.
 *
 * @param options - The options a request or declaration generates with
 * @param running - The config Studio runs, if any
 * @returns The options, with `routesModule` or `routesConfig` where they generate a proxy caller
 * @example
 * ```ts
 * generateCode(spec, withRoutesModule(options, project.snapshot().running));
 * ```
 */
export function withRoutesModule<TOptions extends GenerateOptions>(
  options: TOptions,
  running: LoadedForRoutes | null,
): TOptions {
  const client = options.generateClient;
  if ((client !== "proxy" && client !== "both") || running === null) return options;
  const routesModule = routesModulePath(running.configFile, running.config.studio?.routes);
  /* Beside the config, at the root, as the routes module beside it is. */
  if (routesModule === null) return { ...options, routesConfig: basename(running.configFile) };
  return { ...options, routesModule };
}
