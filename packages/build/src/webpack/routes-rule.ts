import { routesLoaderFile } from "./routes-loader-file";
import type { RoutesLoaderOptions } from "./routes-loader-options";
import type { RoutesProject } from "./routes-project";

/** A module rule of webpack and Rspack that runs the routes loader on one module. */
export interface RoutesLoaderRule {
  /** The module the rule matches, by its real path: webpack and Rspack match a path from its start. */
  test: string;
  /** Before every other loader, which would read the module the package ships. */
  enforce?: "pre";
  /** The routes loader, and what it is told. */
  use: Array<{ loader: string; options: RoutesLoaderOptions }>;
}

/**
 * The rule that builds the routes in place of the module
 * `@noverax/courier/routes` ships, for every bundle the bundler builds: a
 * page's and a server's alike.
 *
 * @param project - The project, as `routesProject()` gives it
 * @returns The rule, for the bundler's `module.rules`
 * @example
 * ```ts
 * config.module.rules.push(routesRule(routesProject(config.context)));
 * ```
 */
export function routesRule(project: RoutesProject): RoutesLoaderRule {
  return {
    test: project.stubFile,
    enforce: "pre",
    use: [{ loader: routesLoaderFile(), options: { root: project.root, config: project.config } }],
  };
}
