import type { Plugin } from "vite";
import { resolveSnippet } from "./core/resolve-snippet";
import type { StudioPluginOptions } from "./core/types";

const FRAMEWORK = "vite";

/**
 * Vite plugin for Nexus Studio.
 * Auto-injects `attachRuntime("vite-browser")` into the client bundle in dev mode.
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
export function nexusStudio(options?: StudioPluginOptions): Plugin {
  let pending: Promise<string | null> | null = null;

  return {
    name: "nexus-studio:inject-html",
    apply: "serve",
    async transformIndexHtml() {
      pending ??= resolveSnippet(FRAMEWORK, options);
      const snippet = await pending;
      if (!snippet) return [];
      return [
        {
          tag: "script",
          attrs: { type: "module" },
          children: snippet,
          injectTo: "head-prepend",
        },
      ];
    },
  };
}
