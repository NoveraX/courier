/**
 * Remix plugin for Courier Studio.
 * Re-exports the Vite plugin — Remix uses Vite under the hood.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { vitePlugin as remix } from "@remix-run/dev"
 * import { courierStudio } from "@noverax/courier-studio/remix"
 *
 * export default defineConfig({
 *   plugins: [remix(), courierStudio()],
 * })
 * ```
 */
export { courierStudio } from "./vite";
