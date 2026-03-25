import { resolveOptions } from "./core/options";
import type { StudioPluginOptions } from "./core/types";

/**
 * Angular initializer for Nexus Studio.
 * Call in `main.ts` to connect to Studio in development.
 *
 * Angular abstracts Vite config, so this uses a runtime approach
 * instead of a build plugin.
 *
 * @example
 * ```ts
 * // src/main.ts
 * import { setupNexusStudio } from "@noverax/nexus-studio/angular"
 *
 * setupNexusStudio()
 *
 * bootstrapApplication(AppComponent, appConfig)
 * ```
 */
export function setupNexusStudio(options?: StudioPluginOptions): void {
  const resolved = resolveOptions(options);
  if (!resolved.enabled) return;

  import("@noverax/nexus-studio-core").then(({ connectStudio }) => {
    connectStudio({
      port: resolved.port,
      host: resolved.host,
      framework: "angular",
      filter: resolved.filter,
    });
  });
}
