import type { Plugin } from "vite";
import type { StudioPluginOptions } from "./core/types";
import { createStudioVitePlugin } from "./core/vite-plugin";

/**
 * Vite plugin for Courier Studio.
 *
 * Connects every page the Vite dev server serves to Studio as the
 * `vite-browser` runtime. It works the same under the frameworks that build on
 * Vite and render their own HTML — SvelteKit, React Router, SolidStart — so
 * the framework-named entry points re-export it. Production builds are left
 * untouched.
 *
 * @param options - `enabled` forces injection on or off; by default it is on
 *   unless `NODE_ENV` is `"production"`.
 * @returns The Vite plugin.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { courierStudio } from "@noverax/courier-studio/vite"
 *
 * export default defineConfig({
 *   plugins: [courierStudio()],
 * })
 * ```
 */
export function courierStudio(options?: StudioPluginOptions): Plugin {
  return createStudioVitePlugin("vite", options);
}
