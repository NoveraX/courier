import type { StudioPluginOptions } from "./types";

/**
 * Whether a plugin connects the bundle it builds to Studio.
 *
 * `enabled` decides when it is given. Otherwise only a development build is
 * connected: the bundler's own mode says which build that is — webpack's
 * `mode`, esbuild's minification, Rollup's watch mode, a dev server — and a
 * `NODE_ENV` of `"production"` rules it out whatever the bundler says.
 * Reading `NODE_ENV` alone let `webpack --mode production`, `rollup -c` and a
 * minified esbuild build, none of which sets it, ship the connection to
 * production, where it dialled a Studio that is not there on every page load.
 *
 * @param options - The plugin's options.
 * @param development - Whether the bundler builds for development.
 * @returns Whether to connect the bundle.
 * @example
 * ```ts
 * isInjectionEnabled({}, compiler.options.mode === "development");
 * ```
 */
export function isInjectionEnabled(
  options: StudioPluginOptions | undefined,
  development: boolean,
): boolean {
  return options?.enabled ?? (development && process.env.NODE_ENV !== "production");
}
