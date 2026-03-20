/**
 * Vue (Vite) plugin for Nexus DevTools.
 * Re-exports the Vite plugin for a framework-specific import path.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import vue from "@vitejs/plugin-vue"
 * import { nexusDevTools } from "@noverax/nexus-devtools/vue"
 *
 * export default defineConfig({
 *   plugins: [vue(), nexusDevTools()],
 * })
 * ```
 */
export { nexusDevTools } from "./vite";
