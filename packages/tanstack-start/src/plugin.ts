/**
 * The Vite plugin that builds a TanStack Start app's routes — what each
 * page's proxy client may call — from `courier.config.ts`, for its pages
 * and the server that renders them. No routes file is written, and a page
 * that imports the config itself fails the build.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { courierRoutes } from "@noverax/courier-tanstack-start/plugin";
 * import { tanstackStart } from "@tanstack/react-start/plugin/vite";
 * import viteReact from "@vitejs/plugin-react";
 * import { defineConfig } from "vite";
 *
 * export default defineConfig({ plugins: [tanstackStart(), viteReact(), courierRoutes()] });
 * ```
 */
export { type CourierRoutesOptions, courierRoutes } from "@noverax/courier-build/vite";
