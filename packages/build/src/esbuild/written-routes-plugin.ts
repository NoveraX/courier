import type { Plugin } from "esbuild";

import { routesFile } from "../routes-file/routes-file";
import type { CourierRoutesOptions } from "../util/courier-routes-options";
import { ROUTES_PATTERN } from "../util/routes-module-id";
import { refuseConfigInPage } from "./config-in-page";

/** Options of the esbuild plugin that takes the routes from a module written to disk. */
export interface WrittenRoutesOptions extends CourierRoutesOptions {
  /** The project's root, absolute: the config is found from it. */
  readonly root: string;
  /** The module the routes are written to, absolute: the host must follow it as a file it reads. */
  readonly file: string;
  /** Whether the host builds again on a change: then the routes read last stay while the config is broken. */
  readonly watch: boolean;
  /** How the app names another place for the module, should that one not take it: said in the error. */
  readonly elsewhere: string;
}

/**
 * The esbuild plugin for a host that follows only the files its build read
 * from disk, as Angular's builders do, not those a plugin names: the
 * routes are written to a module there, which `@noverax/courier/routes`
 * resolves to, and watchers of what they came from rewrite it on a change,
 * so the host builds it again. A page's bundle — any `platform` but `node` —
 * that takes the config itself fails.
 *
 * A build fails while the routes cannot be read, with why; a host that
 * watches keeps the routes read last, and with none read yet the module
 * fails where it is imported, saying why.
 *
 * @param options - Where the project, its config and the module are, and whether the host watches
 * @returns The plugin, once the routes are written
 * @throws RoutesReadError `ROUTES_NOT_WRITTEN` when the module cannot be written
 * @example
 * ```ts
 * const plugin = await writtenRoutesPlugin({ root, file: join(dir, "routes.js"), watch: false, elsewhere: "TMPDIR" });
 * ```
 */
export async function writtenRoutesPlugin(options: WrittenRoutesOptions): Promise<Plugin> {
  const routes = await routesFile(options.root, options.config, options.file, options.elsewhere);
  return {
    name: "courier-routes",
    setup(build) {
      build.onResolve({ filter: ROUTES_PATTERN }, () => {
        const failure = routes.failure;
        if (!options.watch && failure !== undefined) {
          return { errors: [{ text: `[courier] ${failure.message}` }] };
        }
        return { path: routes.file };
      });
      if (build.initialOptions.platform !== "node") {
        refuseConfigInPage(build, options.root, options.config);
      }
    },
  };
}
