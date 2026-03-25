import { resolveOptions } from "./core/options";
import { generateConnectSnippet } from "./core/snippet";
import type { StudioPluginOptions } from "./core/types";

/**
 * Nuxt 3 raw module for Nexus Studio.
 * Auto-injects `connectStudio()` as a client-side plugin in dev mode.
 *
 * Uses the raw module signature `(inlineOptions, nuxt)` with a `.meta` property
 * instead of `defineNuxtModule()` to avoid the `@nuxt/kit` dependency.
 * The `meta.configKey` maps to `nexusStudio` in `nuxt.config.ts`.
 *
 * @param options - Inline options or options from `nuxt.config.ts#nexusStudio`
 * @param nuxt - Nuxt instance provided by the module system
 *
 * @example
 * ```ts
 * // nuxt.config.ts — string shorthand (no options)
 * export default defineNuxtConfig({
 *   modules: ["@noverax/nexus-studio/nuxt"],
 * })
 * ```
 *
 * @example
 * ```ts
 * // nuxt.config.ts — with inline options via tuple
 * export default defineNuxtConfig({
 *   modules: [
 *     ["@noverax/nexus-studio/nuxt", { port: 4380 }],
 *   ],
 * })
 * ```
 *
 * @example
 * ```ts
 * // nuxt.config.ts — with options via configKey
 * export default defineNuxtConfig({
 *   modules: ["@noverax/nexus-studio/nuxt"],
 *   nexusStudio: { port: 4380 },
 * })
 * ```
 */
export async function nexusStudioModule(
  options: StudioPluginOptions,
  nuxt: NuxtLike,
): Promise<void> {
  if (!nuxt.options.dev) return;

  const resolved = { ...resolveOptions(options), framework: "nuxt-client" };
  if (!resolved.enabled) return;

  const snippet = generateConnectSnippet(resolved);

  // Register a client-side plugin via addPlugin pattern
  nuxt.hook("app:templates", (...args: unknown[]) => {
    const app = args[0] as { templates: NuxtTemplate[] };
    app.templates.push({
      filename: "nexus-studio-plugin.client.mjs",
      getContents: () => [`export default function() {`, `  ${snippet}`, `}`].join("\n"),
    });
  });
}

nexusStudioModule.meta = {
  name: "nexus-studio",
  configKey: "nexusStudio",
};

// Minimal Nuxt types to avoid @nuxt/kit dependency
interface NuxtLike {
  options: { dev: boolean };
  hook: (name: string, fn: (...args: unknown[]) => void) => void;
}

interface NuxtTemplate {
  filename: string;
  getContents: () => string;
}
