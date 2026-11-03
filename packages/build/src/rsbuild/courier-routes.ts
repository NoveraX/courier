import type { CourierRoutesOptions } from "../util/courier-routes-options";
import { configInPageRule } from "../webpack/config-in-page-rule";
import { routesProject } from "../webpack/routes-project";
import { routesRule } from "../webpack/routes-rule";

/** What of an Rspack config the plugin adds its rules to. */
interface RulesConfig {
  module?: { rules?: unknown[] } | undefined;
}

/** What of Rsbuild's plugin API the plugin uses. */
export interface RoutesRsbuildApi {
  readonly context: { readonly rootPath: string };
  modifyRspackConfig(
    modify: (config: RulesConfig, utils: { readonly isServer: boolean }) => void,
  ): void;
}

/** An Rsbuild plugin, as Rsbuild takes it in `plugins`. */
export interface RoutesRsbuildPlugin {
  readonly name: string;
  setup(api: RoutesRsbuildApi): void;
}

/**
 * The Rsbuild plugin that builds the routes a page's proxy client may call
 * from `courier.config.ts`, in place of the module `@noverax/courier/routes`
 * ships, for every environment Rsbuild builds: a page's and a server's
 * alike. No routes file is written. A page's bundle that takes the config
 * itself fails.
 *
 * @param options - Where the config is, when it is not found from the project's root
 * @returns The plugin
 * @example
 * ```ts
 * // rsbuild.config.ts
 * import { courierRoutes } from "@noverax/courier-build/rsbuild";
 * import { defineConfig } from "@rsbuild/core";
 *
 * export default defineConfig({ plugins: [courierRoutes()] });
 * ```
 */
export function courierRoutes(options: CourierRoutesOptions = {}): RoutesRsbuildPlugin {
  return {
    name: "courier-routes",
    setup(api) {
      const project = routesProject(api.context.rootPath, options);
      api.modifyRspackConfig((config, { isServer }) => {
        config.module ??= {};
        config.module.rules ??= [];
        const rules = config.module.rules;
        rules.push(routesRule(project));
        const guard = configInPageRule(project);
        if (guard !== undefined && !isServer) rules.push(guard);
      });
    },
  };
}
