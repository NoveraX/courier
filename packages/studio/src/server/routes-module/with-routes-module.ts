import type { LoadedForRoutes } from "@noverax/courier-cli/devkit";
import { routesModulePath } from "@noverax/courier-cli/devkit";
import type { GenerateOptions } from "../../apis/generator";
import { InvalidImportError } from "../../apis/layout/invalid-import-error";

/**
 * Generation options that put the proxy caller's import of its routes where
 * the config puts the routes module. Options without a proxy caller, and a
 * project with no config running yet, are left as they are: the generator
 * then takes the module beside the config, as a config would put it.
 *
 * @param options - The options a request or declaration generates with
 * @param running - The config Studio runs, if any
 * @returns The options, with `routesModule` where they generate a proxy caller
 * @throws {InvalidImportError} When they generate a proxy caller and the config keeps no routes module
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
  if (routesModule === null) {
    throw new InvalidImportError(
      "generateClient",
      client,
      "a proxy caller takes its routes from the routes module, and courier.config sets studio.routes to false; give it a path, or generate the direct caller alone",
    );
  }
  return { ...options, routesModule };
}
