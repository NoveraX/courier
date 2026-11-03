/**
 * Options of the routes plugins that need to know only where the config is:
 * those of webpack, Rspack, Rsbuild, esbuild, Rollup and Jest, and of the
 * frameworks built on them.
 */
export interface CourierRoutesOptions {
  /**
   * The config file, from the project's root or absolute, when it is not
   * the `courier.config.*` in the root or the nearest folder above it.
   */
  config?: string | undefined;
}
