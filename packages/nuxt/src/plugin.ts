import { type CourierRoutesOptions, courierRoutes } from "@noverax/courier-build/vite";
import type { PluginOption } from "vite";

export type { CourierRoutesOptions } from "@noverax/courier-build/vite";

/** The builder Nuxt builds with by default, and the one the routes are built under. */
const VITE_BUILDER = "@nuxt/vite-builder";

/** The part of Nuxt the module touches; its arrays hold more than it adds. */
interface NuxtLike {
  options: { builder?: unknown; vite: { plugins?: PluginOption[] | undefined } };
}

/** What Nuxt reads off a raw module to install it. */
export interface NuxtRawModule {
  (options: CourierRoutesOptions, nuxt: NuxtLike): void;
  getMeta: () => Promise<{ name: string }>;
}

function addRoutesPlugin(options: CourierRoutesOptions, nuxt: NuxtLike): void {
  const builder = nuxt.options.builder ?? VITE_BUILDER;
  if (builder !== VITE_BUILDER) {
    throw new Error(
      `[courier] courierRoutesModule builds the routes under Nuxt's Vite builder, and this app builds with ${String(builder)}: give its proxy clients the routes module \`npx @noverax/courier-cli routes\` writes instead.`,
    );
  }
  nuxt.options.vite.plugins ??= [];
  nuxt.options.vite.plugins.push(courierRoutes(options));
}

/**
 * The Nuxt module that builds the app's routes — what each page's proxy
 * client may call — from `courier.config.ts`, for its pages and for the
 * server that renders them, under `nuxt dev` and `nuxt build` alike. No
 * routes file is written. Options go in the tuple form,
 * `[courierRoutesModule, { config: "config/courier.config.ts" }]`.
 *
 * @example
 * ```ts
 * // nuxt.config.ts
 * import { courierRoutesModule } from "@noverax/courier-nuxt/plugin";
 *
 * export default defineNuxtConfig({ modules: [courierRoutesModule] });
 * ```
 */
export const courierRoutesModule: NuxtRawModule = Object.assign(addRoutesPlugin, {
  getMeta: async () => ({ name: "courier-routes" }),
});
