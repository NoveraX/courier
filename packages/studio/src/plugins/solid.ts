/**
 * Solid Start plugin for Nexus Studio.
 * Re-exports the Vite plugin — Solid Start uses Vite under the hood.
 *
 * @example
 * ```ts
 * // vite.config.ts (or app.config.ts)
 * import { defineConfig } from "@solidjs/start/config"
 * import { nexusStudio } from "@noverax/nexus-studio/solid"
 *
 * export default defineConfig({
 *   vite: { plugins: [nexusStudio()] },
 * })
 * ```
 */
export { nexusStudio } from "./vite";
