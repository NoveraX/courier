/** Options of the routes plugin of webpack, Rspack, Rsbuild and the frameworks built on them. */
export interface CourierRoutesOptions {
  /**
   * The config file, from the project's root or absolute, when it is not
   * the `courier.config.*` in the root or the nearest folder above it.
   */
  config?: string | undefined;
}
