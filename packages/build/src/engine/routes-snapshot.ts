import type { CourierRoutes } from "@noverax/courier/define";

/**
 * The routes of a project's config, as one reading of it gave them, and
 * what that reading depended on.
 */
export interface RoutesSnapshot {
  /** The config file the routes were read from, absolute. */
  readonly configFile: string;
  /**
   * Each source's routes, by its name in the config's `sources`: every
   * source, one that opens nothing to a page with no endpoints.
   */
  readonly routes: Readonly<Record<string, CourierRoutes>>;
  /**
   * Every file the reading depended on, absolute and sorted: the config, the
   * modules it reached and the env files that were or may be read. A change
   * to any of them may change the routes.
   */
  readonly files: readonly string[];
  /**
   * The environment variables the reading looked at, sorted, or `"*"` when it
   * went through all of them.
   */
  readonly env: readonly string[] | "*";
}

/** What reading a project's routes is told: where the project is, and how it reads its variables. */
export interface RoutesRequest {
  /** The project's root, absolute: the config is looked for there and in the folders above it. */
  readonly root: string;
  /** The config file, absolute, when it is not the one found from the root. */
  readonly configFile?: string | undefined;
  /**
   * The env files read before the config, absolute, the first to set a
   * variable winning; a variable the process was started with wins over all.
   */
  readonly envFiles: readonly string[];
}
