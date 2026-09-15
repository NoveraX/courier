/** Public options accepted by every Courier Studio build plugin */
export interface StudioPluginOptions {
  /** Force-enable or force-disable injection. Default: enabled when `NODE_ENV !== "production"` */
  enabled?: boolean;
}

/** Internal context computed by `resolveOptions` and consumed by snippet generation */
export interface ResolvedOptions {
  enabled: boolean;
  framework: string;
  studioUrl: string;
}
