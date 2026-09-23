import type { Plugin } from "vite";
import type { StudioPluginOptions } from "./core/types";
import { createStudioVitePlugin } from "./core/vite-plugin";

/**
 * Astro integration for Courier Studio.
 *
 * Connects every page of `astro dev` to Studio as the `astro-browser`
 * runtime, through the same Vite plugin the Vite integration uses. Builds and
 * previews are left untouched.
 *
 * @param options - `enabled` forces injection on or off; by default it is on
 *   unless `NODE_ENV` is `"production"`.
 * @returns The Astro integration.
 *
 * @example
 * ```ts
 * // astro.config.mjs
 * import { courierStudio } from "@noverax/courier-studio/astro"
 *
 * export default defineConfig({
 *   integrations: [courierStudio()],
 * })
 * ```
 */
export function courierStudio(options?: StudioPluginOptions): AstroIntegrationLike {
  return {
    name: "courier-studio",
    hooks: {
      "astro:config:setup"(ctx: AstroSetupContext) {
        if (ctx.command !== "dev") return;
        ctx.updateConfig({ vite: { plugins: [createStudioVitePlugin("astro", options)] } });
      },
    },
  };
}

interface AstroSetupContext {
  command: string;
  updateConfig(config: { vite: { plugins: Plugin[] } }): unknown;
}

interface AstroIntegrationLike {
  name: string;
  hooks: { "astro:config:setup"(ctx: AstroSetupContext): void };
}
