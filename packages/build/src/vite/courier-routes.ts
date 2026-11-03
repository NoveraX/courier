import { resolve } from "node:path";
import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";

import { configCandidates } from "../config/config-candidates";
import { sharedEngine } from "../engine/shared-engine";
import { configFileOf } from "../util/config-file-of";
import { ROUTES_MODULE_ID, ROUTES_PATTERN, ROUTES_SPECIFIER } from "../util/routes-module-id";
import { refuseConfigInPage } from "./config-in-page";
import { loadRoutesModule } from "./load-routes-module";
import type { RoutesPluginState } from "./routes-plugin-state";
import { viteEnvFiles } from "./vite-env-files";
import { viteEnvValues } from "./vite-env-values";
import { watchRoutesInputs } from "./watch-routes-inputs";

/** Options of the routes plugin. */
export interface CourierRoutesOptions {
  /**
   * The config file, from Vite's root or absolute, when it is not the
   * `courier.config.*` in the root or the nearest folder above it.
   */
  config?: string | undefined;
}

/** A key generator for Vitest's cache of transformed modules: `false` keeps a module out of it. */
type CacheKeyGenerator = (context: { id: string }) => string | false | undefined | null;

/** What Vitest hands a plugin's `configureVitest`: the part read here. */
interface VitestContext {
  /** Vitest 5. */
  defineCacheKeyGenerator?: ((generator: CacheKeyGenerator) => void) | undefined;
  /** Vitest 4, which has the cache under this name. */
  experimental_defineCacheKeyGenerator?: ((generator: CacheKeyGenerator) => void) | undefined;
}

/**
 * The Vite plugin that hands every page, and every server rendering one,
 * the routes its proxy client may call: read from `courier.config.ts` by
 * the rules the proxy applies, in place of the module
 * `@noverax/courier/routes` ships. No routes file is written, and the
 * routes carry no address, path or middleware; a page that imports the
 * config itself fails the build.
 *
 * A build that cannot read the config fails with why; the dev server reads
 * it again whenever something it came from changes, and Vitest, which runs
 * tests through Vite, reruns the tests that import the routes.
 *
 * @param options - Where the config is, when it is not found from the root
 * @returns The plugin
 * @example
 * ```ts
 * // vite.config.ts
 * import { courierRoutes } from "@noverax/courier-build/vite";
 *
 * export default defineConfig({ plugins: [courierRoutes()] });
 * ```
 */
export function courierRoutes(options: CourierRoutesOptions = {}): Plugin {
  const state: RoutesPluginState = {
    servers: new Set(),
    followed: new Set(),
    listed: new Set(),
    underVitest: false,
  };
  const plugin: Plugin & { configureVitest(context: VitestContext): void } = {
    name: "courier-routes",
    enforce: "pre",
    /* Aliased, not only resolved: Vite builds an aliased import into a server's
       bundle, where it would load an installed package's own module as it is. */
    config: () => ({
      resolve: { alias: [{ find: ROUTES_PATTERN, replacement: ROUTES_MODULE_ID }] },
      optimizeDeps: { exclude: [ROUTES_SPECIFIER] },
    }),
    configResolved: (config) => resolveRoutes(state, config, options.config),
    configureServer: (server) => serveRoutes(state, server, options.config),
    resolveId: (id) =>
      id === ROUTES_SPECIFIER || id === ROUTES_MODULE_ID ? ROUTES_MODULE_ID : undefined,
    load(id) {
      return id === ROUTES_MODULE_ID ? loadRoutesModule(this, state) : undefined;
    },
    transform(_code, id, transformOptions) {
      if (!state.underVitest) refuseConfigInPage(this, id, transformOptions, state.configFile);
    },
    /* Vitest runs tests through this Vite, and a test may import the config. Vitest 5
       keeps each module's transform across reruns by the module alone, and would give a
       rerun the routes read before the change that started it: this one it never keeps. */
    configureVitest(context) {
      state.underVitest = true;
      const define =
        context.defineCacheKeyGenerator ?? context.experimental_defineCacheKeyGenerator;
      define?.(({ id }) => (id === ROUTES_MODULE_ID ? false : undefined));
    },
  };
  return plugin;
}

/* What reads the routes for this Vite, and the config a page must not import. */
function resolveRoutes(
  state: RoutesPluginState,
  config: ResolvedConfig,
  named: string | undefined,
): void {
  state.config = config;
  state.engine = sharedEngine({
    root: config.root,
    config: named,
    envFiles: viteEnvFiles(config),
    envValues: () => viteEnvValues(config),
  });
  state.configFile = configFileOf(config.root, named);
}

/* A dev server the routes are served by, which follows where a config may appear or go. */
function serveRoutes(
  state: RoutesPluginState,
  server: ViteDevServer,
  named: string | undefined,
): void {
  state.servers.add(server);
  const root = server.config.root;
  watchRoutesInputs(server, state, {
    candidates: named === undefined ? configCandidates(root) : [resolve(root, named)],
    onChange: () => {
      state.configFile = configFileOf(server.config.root, named);
    },
  });
}
