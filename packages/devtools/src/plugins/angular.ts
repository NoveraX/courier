import { resolveOptions } from "./core/options";
import type { DevToolsPluginOptions } from "./core/types";

/**
 * Angular initializer for Nexus DevTools.
 * Call in `main.ts` to connect to DevTools in development.
 *
 * Angular abstracts Vite config, so this uses a runtime approach
 * instead of a build plugin.
 *
 * @example
 * ```ts
 * // src/main.ts
 * import { setupNexusDevTools } from "@noverax/nexus-devtools/angular"
 *
 * setupNexusDevTools()
 *
 * bootstrapApplication(AppComponent, appConfig)
 * ```
 */
export function setupNexusDevTools(options?: DevToolsPluginOptions): void {
  const resolved = resolveOptions(options);
  if (!resolved.enabled) return;

  import("@noverax/nexus-devtools-core").then(({ connectDevTools }) => {
    connectDevTools({
      port: resolved.port,
      host: resolved.host,
      filter: resolved.filter,
    });
  });
}
