import { sharedEngine } from "../engine/shared-engine";
import { configFileOf } from "../util/config-file-of";
import { configInPageMessage } from "../util/config-in-page-message";
import { ROUTES_MODULE_ID, ROUTES_SPECIFIER } from "../util/routes-module-id";
import { loadRoutesModule, type RoutesPluginContext } from "./load-routes-module";
import type { RollupRoutesOptions } from "./rollup-routes-options";

/** The plugin, as Rollup and Rolldown both take it. */
export interface RoutesRollupPlugin {
  readonly name: string;
  buildStart(): void;
  resolveId(source: string): string | null;
  load(this: RoutesPluginContext, id: string): Promise<string> | null;
  transform(this: RoutesPluginContext, code: string, id: string): null;
}

/**
 * The Rollup and Rolldown plugin that builds the routes a page's proxy
 * client may call from `courier.config.ts`, in place of the module
 * `@noverax/courier/routes` ships. No routes file is written, and the routes
 * carry no address, path or middleware. The bundle is taken for a page's,
 * which fails where it takes the config itself; a server's says so with
 * `server: true`.
 *
 * A build that cannot read the config fails with why. Under `watch`, every
 * file the routes came from is watched; when they cannot be read on a
 * rebuild, the routes read last stay, with a warning.
 *
 * @param options - Where the config is, when it is not found from the folder the bundler runs in, and whether the bundle is a server's
 * @returns The plugin
 * @example
 * ```ts
 * // rollup.config.js
 * import { courierRoutes } from "@noverax/courier-build/rollup";
 *
 * export default { input: "src/main.js", plugins: [courierRoutes()] };
 * ```
 */
export function courierRoutes(options: RollupRoutesOptions = {}): RoutesRollupPlugin {
  const root = process.cwd();
  const engine = sharedEngine({ root, config: options.config, envFiles: [] });
  let configFile: string | undefined;
  return {
    name: "courier-routes",
    /* Found anew for every build: under watch, the config may appear or move. */
    buildStart() {
      configFile = options.server === true ? undefined : configFileOf(root, options.config);
    },
    resolveId: (source) =>
      source === ROUTES_SPECIFIER || source === ROUTES_MODULE_ID ? ROUTES_MODULE_ID : null,
    load(id) {
      return id === ROUTES_MODULE_ID ? loadRoutesModule(this, engine) : null;
    },
    transform(_code, id) {
      if (
        configFile !== undefined &&
        withSlashes(id.split("?")[0] ?? id) === withSlashes(configFile)
      ) {
        this.error(configInPageMessage(configFile));
      }
      return null;
    },
  };
}

function withSlashes(path: string): string {
  return path.split("\\").join("/");
}
