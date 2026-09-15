import { resolveSnippet } from "./core/resolve-snippet";
import type { StudioPluginOptions } from "./core/types";

const FRAMEWORK = "nuxt";

/**
 * Nuxt 3 raw module for Courier Studio.
 * Auto-injects `attachRuntime("nuxt-browser")` as a client-side plugin in dev mode.
 *
 * Uses the raw module signature `(inlineOptions, nuxt)` with a `.meta` property
 * instead of `defineNuxtModule()` to avoid the `@nuxt/kit` dependency.
 *
 * @example
 * ```ts
 * // nuxt.config.ts
 * export default defineNuxtConfig({
 *   modules: ["@noverax/courier-studio/nuxt"],
 * })
 * ```
 */
export async function courierStudioModule(
  options: StudioPluginOptions,
  nuxt: NuxtLike,
): Promise<void> {
  if (!nuxt.options.dev) return;

  const snippet = await resolveSnippet(FRAMEWORK, options);
  if (!snippet) return;

  nuxt.hook("app:templates", (...args: unknown[]) => {
    const app = args[0] as { templates: NuxtTemplate[] };
    app.templates.push({
      filename: "courier-studio-plugin.client.mjs",
      getContents: () => [`export default function() {`, `  ${snippet}`, `}`].join("\n"),
    });
  });
}

courierStudioModule.meta = {
  name: "courier-studio",
  configKey: "courierStudio",
};

interface NuxtLike {
  options: { dev: boolean };
  hook: (name: string, fn: (...args: unknown[]) => void) => void;
}

interface NuxtTemplate {
  filename: string;
  getContents: () => string;
}
