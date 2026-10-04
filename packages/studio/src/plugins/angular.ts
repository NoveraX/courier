/** Options for {@link setupCourierStudio}. */
export interface AngularStudioOptions {
  /**
   * Where Studio listens, when not at the default `http://localhost:6280`.
   * A browser bundle sees neither courier.config nor `COURIER_STUDIO_URL`, so
   * a non-default address has to be named here.
   */
  studioUrl?: string | undefined;
}

const STUDIO_URL_KEY = Symbol.for("courier.studio.url");

/**
 * Angular initializer for Courier Studio.
 *
 * Connects the app to Studio as the `angular-browser` runtime. Angular
 * abstracts its Vite config, so this runs from `main.ts` instead of a build
 * plugin. It does nothing in production builds.
 *
 * @param options - `studioUrl` names a non-default Studio address.
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
export function setupCourierStudio(options: AngularStudioOptions = {}): void {
  /* The import sits inside the check, not after an early return: esbuild,
     which Angular builds with, drops an import only from a branch it can see
     is dead, and otherwise writes the runtime out as a chunk nothing loads. */
  if (process.env.NODE_ENV !== "production") {
    if (options.studioUrl) {
      (globalThis as Record<symbol, unknown>)[STUDIO_URL_KEY] = options.studioUrl;
    }
    /* A literal specifier, so the app's bundler can follow it. */
    import("@noverax/courier-studio-core/runtime")
      .then(({ attachRuntime }) => attachRuntime("angular-browser"))
      .catch((error: unknown) => {
        console.warn("[courier-studio] Could not connect this app to Studio", error);
      });
  }
}
