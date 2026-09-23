import { join } from "node:path";
import { resolveSnippet } from "./core/resolve-snippet";
import { runtimeEntryPath } from "./core/runtime-importer";
import type { StudioPluginOptions } from "./core/types";
import { createStudioVitePlugin } from "./core/vite-plugin";

const FRAMEWORK = "nuxt";
const VITE_BUILDER = "@nuxt/vite-builder";
const PLUGIN_FILENAME = "courier-studio.client.mjs";

/**
 * Under Vite, Nuxt's default builder, the Vite integration does the job: it
 * has Vite pre-bundle the runtime, which a browser cannot load as published.
 * Under webpack and rspack a client-only Nuxt plugin does it, registered the
 * way `addPluginTemplate` from `@nuxt/kit` would, without depending on the kit.
 */
async function attachStudio(options: StudioPluginOptions, nuxt: NuxtLike): Promise<void> {
  if (!nuxt.options.dev) return;

  if (nuxt.options.builder === VITE_BUILDER) {
    nuxt.options.vite.plugins ??= [];
    nuxt.options.vite.plugins.push(createStudioVitePlugin(FRAMEWORK, options));
    return;
  }

  const snippet = await resolveSnippet(FRAMEWORK, options, runtimeEntryPath());
  if (!snippet) return;

  const dst = join(nuxt.options.buildDir, PLUGIN_FILENAME);
  nuxt.options.build.templates.push({
    filename: PLUGIN_FILENAME,
    dst,
    write: true,
    getContents: () =>
      [
        snippet,
        `import { defineNuxtPlugin } from "#app";`,
        `export default defineNuxtPlugin(() => {});`,
      ].join("\n"),
  });
  nuxt.options.plugins.push({ src: dst, mode: "client" });
}

/** What Nuxt reads off a raw module to install it. */
interface NuxtRawModule {
  (options: StudioPluginOptions, nuxt: NuxtLike): Promise<void>;
  getMeta: () => Promise<{ name: string }>;
}

/**
 * Nuxt module for Courier Studio.
 *
 * Connects the app to Studio as the `nuxt-browser` runtime while `nuxt dev`
 * runs, under any of Nuxt's builders. Builds are left untouched. Options go in
 * the tuple form, `[courierStudioModule, { enabled: false }]`.
 *
 * @example
 * ```ts
 * // nuxt.config.ts
 * import { courierStudioModule } from "@noverax/courier-studio/nuxt"
 *
 * export default defineNuxtConfig({
 *   modules: [courierStudioModule],
 * })
 * ```
 */
export const courierStudioModule: NuxtRawModule = Object.assign(attachStudio, {
  getMeta: async () => ({ name: "courier-studio" }),
});

/** The part of Nuxt this module touches; its arrays hold more than it adds. */
interface NuxtLike {
  options: {
    dev: boolean;
    builder: unknown;
    buildDir: string;
    build: { templates: unknown[] };
    plugins: unknown[];
    vite: { plugins?: unknown[] };
  };
}
