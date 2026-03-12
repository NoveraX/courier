import type { Plugin } from "vite";
import { resolveOptions } from "./core/options";
import { generateConnectSnippet } from "./core/snippet";
import type { DevToolsPluginOptions } from "./core/types";
import { nexusDevToolsUnplugin } from "./unplugin";

/**
 * Vite plugin for Nexus DevTools.
 * Auto-injects `connectDevTools()` into the client bundle in dev mode.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { nexusDevTools } from "@noverax/nexus-devtools/vite"
 *
 * export default defineConfig({
 *   plugins: [nexusDevTools()],
 * })
 * ```
 */
export function nexusDevTools(options?: DevToolsPluginOptions): Plugin[] {
  const resolved = resolveOptions(options);
  if (!resolved.enabled) return [];

  /* Pass raw options to unplugin — it calls resolveOptions internally */
  const base = nexusDevToolsUnplugin.vite(options) as Plugin;

  const htmlPlugin: Plugin = {
    name: "nexus-devtools:inject-html",
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
