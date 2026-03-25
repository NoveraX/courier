import type { Plugin } from "vite";
import { resolveOptions } from "./core/options";
import { generateConnectSnippet } from "./core/snippet";
import type { StudioPluginOptions } from "./core/types";
import { nexusStudioUnplugin } from "./unplugin";

/**
 * Vite plugin for Nexus Studio.
 * Auto-injects `connectStudio()` into the client bundle in dev mode.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { nexusStudio } from "@noverax/nexus-studio/vite"
 *
 * export default defineConfig({
 *   plugins: [nexusStudio()],
 * })
 * ```
 */
export function nexusStudio(options?: StudioPluginOptions): Plugin[] {
  const resolved = resolveOptions(options);
  if (!resolved.enabled) return [];

  /* Pass raw options to unplugin — it calls resolveOptions internally */
  const base = nexusStudioUnplugin.vite(options) as Plugin;

  const htmlPlugin: Plugin = {
    name: "nexus-studio:inject-html",
    apply: "serve",
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: { type: "module" },
          children: generateConnectSnippet(resolved),
          injectTo: "head-prepend",
        },
      ];
    },
  };

  return [base, htmlPlugin];
}
