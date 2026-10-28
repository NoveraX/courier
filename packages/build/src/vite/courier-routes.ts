import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

import { configCandidates } from "../config/config-candidates";
import { errnoCode } from "../config/errno-code";
import { findConfigFile } from "../config/load-config";
import { UntrustedConfigError } from "../config/untrusted-config-error";
import { refuseConfigInPage } from "./config-in-page";
import { loadRoutesModule } from "./load-routes-module";
import { ROUTES_MODULE_ID, ROUTES_PATTERN, ROUTES_SPECIFIER } from "./routes-module-id";
import type { RoutesPluginState } from "./routes-plugin-state";
import { sharedEngine } from "./shared-engine";
import { viteEnvFiles } from "./vite-env-files";
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
 * `@noverax/courier/routes` ships. No routes file is written, and nothing
 * of the config but the routes reaches a bundle.
 *
 * A build that cannot read the config fails with why; the dev server reads
 * it again whenever a file it came from changes, and Vitest, which runs
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
    configResolved(config) {
      state.config = config;
      state.engine = sharedEngine({
        root: config.root,
        config: options.config,
        envFiles: viteEnvFiles(config),
      });
      state.configFile = configFileOf(config, options.config);
    },
    configureServer(server) {
      state.servers.add(server);
      const root = server.config.root;
      watchRoutesInputs(server, state, {
        candidates:
          options.config === undefined ? configCandidates(root) : [resolve(root, options.config)],
        onChange: () => {
          state.configFile = configFileOf(server.config, options.config);
        },
      });
    },
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

/* The config file the plugin reads, as Vite names a module: its real path. One that is
   not there yet, or that is not run, the engine reports when the routes are read. */
function configFileOf(config: ResolvedConfig, named: string | undefined): string | undefined {
  try {
    const file = named === undefined ? findConfigFile(config.root) : resolve(config.root, named);
    return file === null ? undefined : realpathSync(file);
  } catch (error) {
    if (error instanceof UntrustedConfigError || errnoCode(error) === "ENOENT") return undefined;
    throw error;
  }
}
