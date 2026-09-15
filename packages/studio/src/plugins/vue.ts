/**
 * Vue (Vite) plugin for Courier Studio.
 * Re-exports the Vite plugin for a framework-specific import path.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import vue from "@vitejs/plugin-vue"
 * import { courierStudio } from "@noverax/courier-studio/vue"
 *
 * export default defineConfig({
 *   plugins: [vue(), courierStudio()],
 * })
 * ```
 */
export { courierStudio } from "./vite";
