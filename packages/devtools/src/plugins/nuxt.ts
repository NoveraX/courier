import { startDevToolsServer } from "./core/auto-start";
import { resolveOptions } from "./core/options";
import { generateConnectSnippet } from "./core/snippet";
import type { DevToolsPluginOptions } from "./core/types";

/**
 * Nuxt 3 raw module for Nexus DevTools.
 * Auto-injects `connectDevTools()` as a client-side plugin in dev mode.
 *
 * Uses the raw module signature `(inlineOptions, nuxt)` with a `.meta` property
 * instead of `defineNuxtModule()` to avoid the `@nuxt/kit` dependency.
 * The `meta.configKey` maps to `nexusDevTools` in `nuxt.config.ts`.
 *
 * @param options - Inline options or options from `nuxt.config.ts#nexusDevTools`
 * @param nuxt - Nuxt instance provided by the module system
 *
 * @example
 * ```ts
 * // nuxt.config.ts — string shorthand (no options)
 * export default defineNuxtConfig({
 *   modules: ["@noverax/nexus-devtools/nuxt"],
 * })
 * ```
 *
 * @example
 * ```ts
 * // nuxt.config.ts — with inline options via tuple
 * export default defineNuxtConfig({
 *   modules: [
 *     ["@noverax/nexus-devtools/nuxt", { port: 4380 }],
 *   ],
 * })
 * ```
 *
 * @example
 * ```ts
 * // nuxt.config.ts — with options via configKey
 * export default defineNuxtConfig({
 *   modules: ["@noverax/nexus-devtools/nuxt"],
 *   nexusDevTools: { port: 4380 },
 * })
 * ```
 */
export async function nexusDevToolsModule(
  options: DevToolsPluginOptions,
  nuxt: NuxtLike,
): Promise<void> {
  if (!nuxt.options.dev) return;

  const resolved = resolveOptions(options);
  if (!resolved.enabled) return;

  if (resolved.autoStart) {
    startDevToolsServer(resolved);
  }

  const snippet = generateConnectSnippet(resolved);

  // Register a client-side plugin via addPlugin pattern
  nuxt.hook("app:templates", (...args: unknown[]) => {
    const app = args[0] as { templates: NuxtTemplate[] };
    app.templates.push({
      filename: "nexus-devtools-plugin.client.mjs",
      getContents: () => [`export default function() {`, `  ${snippet}`, `}`].join("\n"),
    });
  });
}

nexusDevToolsModule.meta = {
  name: "nexus-devtools",
  configKey: "nexusDevTools",
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
