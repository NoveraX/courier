import type { ResolvedConfig, ViteDevServer } from "vite";

import type { RoutesEngine } from "../engine/routes-engine";

/** What one routes plugin knows of the Vite it runs in, filled as Vite calls it. */
export interface RoutesPluginState {
  /** Vite's config, once resolved. */
  config?: ResolvedConfig | undefined;
  /** The engine that reads the project's routes, once the config is resolved. */
  engine?: RoutesEngine | undefined;
  /** The project's config file, found from the root, for a page that must not import it. */
  configFile?: string | undefined;
  /**
   * The dev servers the plugin serves, when Vite serves rather than builds:
   * a framework may run one per router with the same plugin.
   */
  readonly servers: Set<ViteDevServer>;
  /**
   * The project's paths the latest reading depended on: a change to one,
   * one appearing or going, or an entry of a folder among them, may change
   * the routes.
   */
  followed: ReadonlySet<string>;
  /** Whether Vitest runs the tests through this Vite: its pages are tests, which may import the config. */
  underVitest: boolean;
}
