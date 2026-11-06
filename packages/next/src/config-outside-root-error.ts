import { CourierError } from "@noverax/courier/server";

/** Where the config lies, and the root Turbopack keeps to. */
export interface ConfigOutsideRootContext extends Record<string, unknown> {
  configFile: string;
  root: string;
}

/**
 * The app's `courier.config` lies outside `turbopack.root`. Turbopack
 * resolves and watches no file outside its root, so the routes would not
 * follow an edit of the config or of what it imports.
 *
 * @example
 * ```ts
 * throw new ConfigOutsideRootError("/repo/courier.config.ts", "/repo/apps/web");
 * ```
 */
export class ConfigOutsideRootError extends CourierError<"CONFIG_OUTSIDE_ROOT"> {
  declare readonly context: ConfigOutsideRootContext;

  /**
   * @param configFile - The config file
   * @param root - The app's `turbopack.root`
   */
  constructor(configFile: string, root: string) {
    super(
      `[courier] ${configFile} lies outside turbopack.root, ${root}, where Turbopack follows no file: set turbopack.root to a folder that holds both, or move the config inside it.`,
      { code: "CONFIG_OUTSIDE_ROOT", context: { configFile, root } },
    );
  }
}
