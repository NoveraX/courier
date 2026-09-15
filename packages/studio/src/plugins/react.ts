/**
 * React (Vite) plugin for Courier Studio.
 * Re-exports the Vite plugin for a framework-specific import path.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import react from "@vitejs/plugin-react"
 * import { courierStudio } from "@noverax/courier-studio/react"
 *
 * export default defineConfig({
 *   plugins: [react(), courierStudio()],
 * })
 * ```
 */
export { courierStudio } from "./vite";
