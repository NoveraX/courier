/**
 * Solid Start plugin for Nexus DevTools.
 * Re-exports the Vite plugin — Solid Start uses Vite under the hood.
 *
 * @example
 * ```ts
 * // vite.config.ts (or app.config.ts)
 * import { defineConfig } from "@solidjs/start/config"
 * import { nexusDevTools } from "@noverax/nexus-devtools/solid"
 *
 * export default defineConfig({
 *   vite: { plugins: [nexusDevTools()] },
 * })
 * ```
 */
export { nexusDevTools } from "./vite";
