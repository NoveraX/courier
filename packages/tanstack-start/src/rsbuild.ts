/**
 * The Rsbuild plugin that builds a TanStack Start app's routes — what each
 * page's proxy client may call — from `courier.config.ts`, for an app
 * TanStack Start builds with Rsbuild: its pages and the server that renders
 * them. No routes file is written, and a page that imports the config itself
 * fails the build.
 *
 * @example
 * ```ts
 * // rsbuild.config.ts
 * import { courierRoutes } from "@noverax/courier-tanstack-start/rsbuild";
 * import { defineConfig } from "@rsbuild/core";
 * import { pluginReact } from "@rsbuild/plugin-react";
 * import { tanstackStart } from "@tanstack/react-start/plugin/rsbuild";
 *
 * export default defineConfig({ plugins: [pluginReact(), tanstackStart(), courierRoutes()] });
 * ```
 */
export { type CourierRoutesOptions, courierRoutes } from "@noverax/courier-build/rsbuild";
