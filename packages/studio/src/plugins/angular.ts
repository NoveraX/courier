/**
 * Angular initializer for Courier Studio.
 * Call in `main.ts` to connect to Studio in development.
 *
 * Angular abstracts Vite config, so this uses a runtime approach instead
 * of a build plugin. Set `globalThis[Symbol.for("courier.studio.url")]` (or
 * the `COURIER_STUDIO_URL` env var) to override the default `localhost:6280`.
 *
 * @example
 * ```ts
 * // src/main.ts
 * import { setupCourierStudio } from "@noverax/courier-studio/angular"
 *
 * setupCourierStudio()
 *
 * bootstrapApplication(AppComponent, appConfig)
 * ```
 */
export function setupCourierStudio(): void {
  if (process.env.NODE_ENV === "production") return;

  import("@noverax/courier-studio-core/runtime").then(({ attachRuntime }) => {
    attachRuntime("angular-browser");
  });
}
