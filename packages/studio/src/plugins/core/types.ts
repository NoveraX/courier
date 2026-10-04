/** Public options accepted by every Courier Studio build plugin */
export interface StudioPluginOptions {
  /**
   * Force-enable or force-disable injection. Default: enabled in a development
   * build — as the bundler's mode says — unless `NODE_ENV` is `"production"`.
   */
  enabled?: boolean | undefined;
}

/** What the connect snippet is generated from */
export interface ResolvedOptions {
  framework: string;
  studioUrl: string;
}
