/**
 * The Vite plugin that builds a SolidStart app's routes — what each page's
 * proxy client may call — from `courier.config.ts`, for its pages, the
 * server that renders them and its server functions. No routes file is
 * written. SolidStart 1 takes it in `app.config.ts` under `vite`.
 *
 * @example
 * ```ts
 * // vite.config.ts — SolidStart 2
 * import { solidStart } from "@solidjs/start/config";
 * import { courierRoutes } from "@noverax/courier-solid/plugin";
 * import { defineConfig } from "vite";
 *
 * export default defineConfig({ plugins: [solidStart(), courierRoutes()] });
 * ```
 */
export { type CourierRoutesOptions, courierRoutes } from "@noverax/courier-build/vite";
