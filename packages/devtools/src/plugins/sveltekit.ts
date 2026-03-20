/**
 * SvelteKit plugin for Nexus DevTools.
 * Re-exports the Vite plugin — SvelteKit uses Vite under the hood.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { sveltekit } from "@sveltejs/kit/vite"
 * import { nexusDevTools } from "@noverax/nexus-devtools/sveltekit"
 *
 * export default defineConfig({
 *   plugins: [sveltekit(), nexusDevTools()],
 * })
 * ```
 */
export { nexusDevTools } from "./vite";
