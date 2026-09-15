/**
 * SvelteKit plugin for Courier Studio.
 * Re-exports the Vite plugin — SvelteKit uses Vite under the hood.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { sveltekit } from "@sveltejs/kit/vite"
 * import { courierStudio } from "@noverax/courier-studio/sveltekit"
 *
 * export default defineConfig({
 *   plugins: [sveltekit(), courierStudio()],
 * })
 * ```
 */
export { courierStudio } from "./vite";
