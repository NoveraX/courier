/**
 * Remix plugin for Nexus Studio.
 * Re-exports the Vite plugin — Remix uses Vite under the hood.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { vitePlugin as remix } from "@remix-run/dev"
 * import { nexusStudio } from "@noverax/nexus-studio/remix"
 *
 * export default defineConfig({
 *   plugins: [remix(), nexusStudio()],
 * })
 * ```
 */
export { nexusStudio } from "./vite";
