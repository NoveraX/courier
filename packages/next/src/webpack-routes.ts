import {
  configInPageRule,
  type RoutesProject,
  routesProject,
  routesRule,
} from "@noverax/courier-build/webpack";

/** What of a webpack config Next.js hands its `webpack` function the plugin adds its rules to. */
export interface NextWebpackConfig {
  module?: { rules?: unknown[] } | undefined;
}

/** What Next.js tells its `webpack` function of the bundle it builds. */
export interface NextWebpackContext {
  /** The app's folder. */
  readonly dir: string;
  /** Whether the bundle is a server's, Node's or the edge's, rather than a page's. */
  readonly isServer: boolean;
}

/** The `webpack` function of a Next.js config. */
export type NextWebpack<TConfig extends NextWebpackConfig = NextWebpackConfig> = (
  config: TConfig,
  context: NextWebpackContext,
) => TConfig;

/**
 * A `webpack` function that runs the app's own, then adds the rules that
 * build the routes in place of the module `@noverax/courier/routes` ships,
 * in every bundle, and fail a page's bundle that takes the config itself.
 *
 * @param project - The project, as read where the app's config was loaded
 * @param own - The app's own `webpack` function, if it has one
 * @param config - The config file the plugin's options name
 * @returns The function, for the config's `webpack`
 * @example
 * ```ts
 * nextConfig.webpack = withRoutesWebpack(project, nextConfig.webpack);
 * ```
 */
export function withRoutesWebpack<TConfig extends NextWebpackConfig>(
  project: RoutesProject,
  own: NextWebpack<TConfig> | null | undefined,
  config?: string | undefined,
): NextWebpack<TConfig> {
  return (webpackConfig, context) => {
    const built = own ? own(webpackConfig, context) : webpackConfig;
    const app = context.dir === project.root ? project : routesProject(context.dir, { config });
    built.module ??= {};
    built.module.rules ??= [];
    const rules = built.module.rules;
    rules.push(routesRule(app));
    const guard = configInPageRule(app);
    if (guard !== undefined && !context.isServer) rules.push(guard);
    return built;
  };
}
