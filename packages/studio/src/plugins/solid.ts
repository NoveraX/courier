/**
 * Solid Start plugin for Courier Studio.
 * Re-exports the Vite plugin — Solid Start uses Vite under the hood.
 *
 * @example
 * ```ts
 * // vite.config.ts (or app.config.ts)
 * import { defineConfig } from "@solidjs/start/config"
 * import { courierStudio } from "@noverax/courier-studio/solid"
 *
 * export default defineConfig({
 *   vite: { plugins: [courierStudio()] },
 * })
 * ```
 */
export { courierStudio } from "./vite";
