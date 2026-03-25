/**
 * SvelteKit plugin for Nexus Studio.
 * Re-exports the Vite plugin — SvelteKit uses Vite under the hood.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { sveltekit } from "@sveltejs/kit/vite"
 * import { nexusStudio } from "@noverax/nexus-studio/sveltekit"
 *
 * export default defineConfig({
 *   plugins: [sveltekit(), nexusStudio()],
 * })
 * ```
 */
export { nexusStudio } from "./vite";
