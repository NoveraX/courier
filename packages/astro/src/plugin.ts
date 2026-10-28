import {
  type CourierRoutesOptions,
  courierRoutes as courierRoutesVitePlugin,
} from "@noverax/courier-build/vite";
import type { Plugin } from "vite";

export type { CourierRoutesOptions } from "@noverax/courier-build/vite";

/** The part of Astro's setup hook the integration uses. */
interface AstroSetupContext {
  updateConfig(config: { vite: { plugins: Plugin[] } }): unknown;
}

/** An Astro integration, by the parts Astro reads. */
export interface AstroIntegrationLike {
  name: string;
  hooks: { "astro:config:setup": (context: AstroSetupContext) => void };
}

/**
 * The Astro integration that builds the app's routes — what each page's
 * proxy client may call — from `courier.config.ts`, for its pages, its
 * client scripts and the server that renders them, under `astro dev` and
 * `astro build` alike. No routes file is written.
 *
 * @param options - Where the config is, when it is not found from the root
 * @returns The integration
 * @example
 * ```ts
 * // astro.config.mjs
 * import { courierRoutes } from "@noverax/courier-astro/plugin";
 * import { defineConfig } from "astro/config";
 *
 * export default defineConfig({ integrations: [courierRoutes()] });
 * ```
 */
export function courierRoutes(options?: CourierRoutesOptions): AstroIntegrationLike {
  return {
    name: "courier-routes",
    hooks: {
      "astro:config:setup"(context) {
        context.updateConfig({ vite: { plugins: [courierRoutesVitePlugin(options)] } });
      },
    },
  };
}
