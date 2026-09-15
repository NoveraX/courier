import type { Plugin } from "vite";
import { resolveSnippet } from "./core/resolve-snippet";
import type { StudioPluginOptions } from "./core/types";

const FRAMEWORK = "vite";

/**
 * Vite plugin for Courier Studio.
 * Auto-injects `attachRuntime("vite-browser")` into the client bundle in dev mode.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { courierStudio } from "@noverax/courier-studio/vite"
 *
 * export default defineConfig({
 *   plugins: [courierStudio()],
 * })
 * ```
 */
export function courierStudio(options?: StudioPluginOptions): Plugin {
  let pending: Promise<string | null> | null = null;

  return {
    name: "courier-studio:inject-html",
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
