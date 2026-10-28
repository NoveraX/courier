import type { CourierRoutes } from "@noverax/courier/define";

/**
 * What one reading of a project's routes depended on: a change to any of it
 * may change what the next reading gives.
 */
export interface RoutesInputs {
  /** The config file read, absolute, once one was found. */
  readonly configFile?: string | undefined;
  /**
   * Every path the reading depended on, absolute and sorted: the config, the
   * modules it reached, the env files that were or may be read, the files
   * it read and the paths it looked at. A file counts by its contents; a
   * path that is not there or is a folder, by whether it is there and what
   * it is.
   */
  readonly files: readonly string[];
  /**
   * The folders whose entries the reading listed, absolute and sorted: an
   * entry added or removed may change what it gives. None when omitted.
   */
  readonly listed?: readonly string[] | undefined;
  /**
   * The environment variables the reading looked at, sorted, or `"*"` when it
   * went through all of them.
   */
  readonly env: readonly string[] | "*";
}

/**
 * The routes of a project's config, as one reading of it gave them, and
 * what that reading depended on.
 */
export interface RoutesSnapshot extends RoutesInputs {
  /** The config file the routes were read from, absolute. */
  readonly configFile: string;
  /**
   * Each source's routes, by its name in the config's `sources`: every
   * source, one that opens nothing to a page with no endpoints.
   */
  readonly routes: Readonly<Record<string, CourierRoutes>>;
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
  /**
   * The variables those files give, as the bundler reads them — with its own
   * expansion of `${VAR}` — in place of reading them here. A variable the
   * process was started with still wins.
   */
  readonly env?: Readonly<Record<string, string>> | undefined;
}
