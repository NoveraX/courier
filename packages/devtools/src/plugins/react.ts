/**
 * React (Vite) plugin for Nexus DevTools.
 * Re-exports the Vite plugin for a framework-specific import path.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import react from "@vitejs/plugin-react"
 * import { nexusDevTools } from "@noverax/nexus-devtools/react"
 *
 * export default defineConfig({
 *   plugins: [react(), nexusDevTools()],
 * })
 * ```
 */
export { nexusDevTools } from "./vite";
