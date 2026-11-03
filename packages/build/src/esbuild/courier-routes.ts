import type { Plugin } from "esbuild";

import { sharedEngine } from "../engine/shared-engine";
import type { CourierRoutesOptions } from "../util/courier-routes-options";
import { ROUTES_PATTERN, ROUTES_SPECIFIER } from "../util/routes-module-id";
import { refuseConfigInPage } from "./config-in-page";
import { loadRoutes } from "./load-routes";

/* Where esbuild keeps the routes module, apart from the files it reads from disk. */
const NAMESPACE = "courier-routes";

/* Every path: the namespace alone tells the routes module. */
const ANY_PATH = /.*/;

/**
 * The esbuild plugin that builds the routes a page's proxy client may call
 * from `courier.config.ts`, in place of the module `@noverax/courier/routes`
 * ships. No routes file is written, and the routes carry no address, path or
 * middleware. A page's bundle — any `platform` but `node` — that takes the
 * config itself fails.
 *
 * A build that cannot read the config fails with why. A context that builds
 * again, under `watch()` or `serve()`, follows every file the routes came
 * from; when they cannot be read on a later build, it keeps the routes it
 * read last and warns why.
 *
 * @param options - Where the config is, when it is not found from `absWorkingDir`
 * @returns The plugin
 * @example
 * ```ts
 * import { build } from "esbuild";
 * import { courierRoutes } from "@noverax/courier-build/esbuild";
 *
 * await build({ entryPoints: ["src/main.ts"], bundle: true, plugins: [courierRoutes()] });
 * ```
 */
export function courierRoutes(options: CourierRoutesOptions = {}): Plugin {
  return {
    name: "courier-routes",
    setup(build) {
      const root = build.initialOptions.absWorkingDir ?? process.cwd();
      const engine = sharedEngine({ root, config: options.config, envFiles: [] });
      let builds = 0;
      build.onStart(() => {
        builds += 1;
      });
      build.onResolve({ filter: ROUTES_PATTERN }, () => ({
        path: ROUTES_SPECIFIER,
        namespace: NAMESPACE,
      }));
      build.onLoad({ filter: ANY_PATH, namespace: NAMESPACE }, () =>
        loadRoutes(engine, builds > 1),
      );
      if (build.initialOptions.platform !== "node") refuseConfigInPage(build, root, options.config);
    },
  };
}
