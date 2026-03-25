/**
 * Vue (Vite) plugin for Nexus Studio.
 * Re-exports the Vite plugin for a framework-specific import path.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import vue from "@vitejs/plugin-vue"
 * import { nexusStudio } from "@noverax/nexus-studio/vue"
 *
 * export default defineConfig({
 *   plugins: [vue(), nexusStudio()],
 * })
 * ```
 */
export { nexusStudio } from "./vite";
