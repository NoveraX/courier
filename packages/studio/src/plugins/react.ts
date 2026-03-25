/**
 * React (Vite) plugin for Nexus Studio.
 * Re-exports the Vite plugin for a framework-specific import path.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import react from "@vitejs/plugin-react"
 * import { nexusStudio } from "@noverax/nexus-studio/react"
 *
 * export default defineConfig({
 *   plugins: [react(), nexusStudio()],
 * })
 * ```
 */
export { nexusStudio } from "./vite";
