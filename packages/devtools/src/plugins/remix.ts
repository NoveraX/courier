/**
 * Remix plugin for Nexus DevTools.
 * Re-exports the Vite plugin — Remix uses Vite under the hood.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { vitePlugin as remix } from "@remix-run/dev"
 * import { nexusDevTools } from "@noverax/nexus-devtools/remix"
 *
 * export default defineConfig({
 *   plugins: [remix(), nexusDevTools()],
 * })
 * ```
 */
export { nexusDevTools } from "./vite";
