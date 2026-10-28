/**
 * The Vite plugin that builds a SvelteKit app's routes — what each page's
 * proxy client may call — from `courier.config.ts`, for its pages and for
 * the server that renders them. No routes file is written.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { sveltekit } from "@sveltejs/kit/vite";
 * import { courierRoutes } from "@noverax/courier-sveltekit/plugin";
 * import { defineConfig } from "vite";
 *
 * export default defineConfig({ plugins: [sveltekit(), courierRoutes()] });
 * ```
 */
export { type CourierRoutesOptions, courierRoutes } from "@noverax/courier-build/vite";
