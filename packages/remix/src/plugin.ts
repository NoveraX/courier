/**
 * The Vite plugin that builds the routes of a React Router app, or of a
 * Remix app on Vite — what each page's proxy client may call — from
 * `courier.config.ts`, for its pages and for the server that renders them.
 * No routes file is written.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { reactRouter } from "@react-router/dev/vite";
 * import { courierRoutes } from "@noverax/courier-remix/plugin";
 * import { defineConfig } from "vite";
 *
 * export default defineConfig({ plugins: [reactRouter(), courierRoutes()] });
 * ```
 */
export { type CourierRoutesOptions, courierRoutes } from "@noverax/courier-build/vite";
