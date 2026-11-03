import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

import { RoutesReadError } from "../engine/routes-read-error";
import { configFileOf } from "../util/config-file-of";
import type { CourierRoutesOptions } from "./courier-routes-options";

/** What the routes rules of a project are made from. */
export interface RoutesProject {
  /** The project's root, absolute. */
  readonly root: string;
  /** The config file the options name, absolute; none when it is the one found from the root. */
  readonly config?: string | undefined;
  /**
   * The module `@noverax/courier/routes` resolves to from the root, by its
   * real path, as a bundler names it: the module the routes are built in
   * place of.
   */
  readonly stubFile: string;
  /** The config's real path, when there is one to read: a page's bundle must not take it. */
  readonly configFile?: string | undefined;
}

/**
 * The project a bundler builds, as its routes rules need it.
 *
 * @param root - The project's root, where the bundler resolves its packages from
 * @param options - The plugin's options
 * @returns The project
 * @throws RoutesReadError `CORE_NOT_FOUND` when `@noverax/courier` does not resolve from the root
 * @example
 * ```ts
 * routesProject("/app"); // { root: "/app", stubFile: "/app/node_modules/@noverax/courier/lib/routes/index.js", configFile: "/app/courier.config.ts" }
 * ```
 */
export function routesProject(root: string, options: CourierRoutesOptions = {}): RoutesProject {
  const config = options.config === undefined ? undefined : resolve(root, options.config);
  return {
    root,
    config,
    stubFile: stubFileOf(root),
    configFile: configFileOf(root, config),
  };
}

function stubFileOf(root: string): string {
  try {
    return realpathSync(
      createRequire(join(root, "package.json")).resolve("@noverax/courier/routes"),
    );
  } catch (error) {
    throw new RoutesReadError(
      "CORE_NOT_FOUND",
      `@noverax/courier does not resolve from ${root}, so there is no routes module to build the routes in place of. Install it in the project, beside @noverax/courier-build.`,
      { root },
      { stack: error instanceof Error ? error.stack : undefined },
    );
  }
}
