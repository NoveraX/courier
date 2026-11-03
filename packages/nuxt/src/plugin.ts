import { type CourierRoutesOptions, courierRoutes } from "@noverax/courier-build/vite";
import type { PluginOption } from "vite";

import { bundlerRoutesHook, type NuxtBundlerConfig } from "./bundler-routes-hook";
import { UnsupportedBuilderError } from "./unsupported-builder-error";

export type { CourierRoutesOptions } from "@noverax/courier-build/vite";
export type { NuxtBundlerConfig } from "./bundler-routes-hook";
export {
  type UnsupportedBuilderContext,
  UnsupportedBuilderError,
} from "./unsupported-builder-error";

/** The builder Nuxt builds with by default, under which the routes go through Vite. */
const VITE_BUILDER = "@nuxt/vite-builder";

/** The other builders, by the hook through which each hands the module its bundles' configs. */
const CONFIG_HOOKS: ReadonlyMap<string, "webpack:config" | "rspack:config"> = new Map([
  ["@nuxt/webpack-builder", "webpack:config"],
  ["webpack", "webpack:config"],
  ["@nuxt/rspack-builder", "rspack:config"],
  ["rspack", "rspack:config"],
]);

/** The part of Nuxt the module touches; its arrays hold more than it adds. */
interface NuxtLike {
  options: {
    builder?: unknown;
    rootDir: string;
    vite: { plugins?: PluginOption[] | undefined };
  };
  hook(name: "webpack:config" | "rspack:config", run: (configs: NuxtBundlerConfig[]) => void): void;
}

/** What Nuxt reads off a raw module to install it. */
export interface NuxtRawModule {
  (options: CourierRoutesOptions, nuxt: NuxtLike): void;
  getMeta: () => Promise<{ name: string }>;
}

function addRoutesPlugin(options: CourierRoutesOptions, nuxt: NuxtLike): void {
  const builder = nuxt.options.builder ?? VITE_BUILDER;
  if (builder === VITE_BUILDER || builder === "vite") {
    nuxt.options.vite.plugins ??= [];
    nuxt.options.vite.plugins.push(courierRoutes(options));
    return;
  }
  const hook = typeof builder === "string" ? CONFIG_HOOKS.get(builder) : undefined;
  if (hook === undefined) throw new UnsupportedBuilderError(String(builder));
  nuxt.hook(hook, bundlerRoutesHook(nuxt.options.rootDir, options));
}

/**
 * The Nuxt module that builds the app's routes — what each page's proxy
 * client may call — from `courier.config.ts`, for its pages and for the
 * server that renders them, under `nuxt dev` and `nuxt build` alike, with
 * Nuxt's Vite, webpack or Rspack builder. No routes file is written.
 * Options go in the tuple form,
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
