import { routesLoaderFile } from "./routes-loader-file";
import type { RoutesProject } from "./routes-project";
import type { RoutesLoaderRule } from "./routes-rule";

/**
 * The rule that fails a page's bundle where it takes the project's config
 * as a module: it would ship the server's settings and every API's
 * definition to the browser. Only for the bundles a browser runs; a server's
 * may import the config.
 *
 * @param project - The project, as `routesProject()` gives it
 * @returns The rule, for the `module.rules` of a page's bundle; none when the project has no config yet
 * @example
 * ```ts
 * const rule = configInPageRule(project);
 * if (rule && !isServer) config.module.rules.push(rule);
 * ```
 */
export function configInPageRule(project: RoutesProject): RoutesLoaderRule | undefined {
  if (project.configFile === undefined) return undefined;
  return {
    test: project.configFile,
    use: [
      {
        loader: routesLoaderFile(),
        options: { root: project.root, config: project.config, refuse: "config-in-page" },
      },
    ],
  };
}
