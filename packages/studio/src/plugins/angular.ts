/**
 * Angular initializer for Nexus Studio.
 * Call in `main.ts` to connect to Studio in development.
 *
 * Angular abstracts Vite config, so this uses a runtime approach instead
 * of a build plugin. Set `globalThis[Symbol.for("nexus.studio.url")]` (or
 * the `NEXUS_STUDIO_URL` env var) to override the default `127.0.0.1:6280`.
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
export function setupNexusStudio(): void {
  if (process.env.NODE_ENV === "production") return;

  import("@noverax/nexus-studio-core/runtime").then(({ attachRuntime }) => {
    attachRuntime("angular-browser");
  });
}
