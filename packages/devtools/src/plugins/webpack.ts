import { startDevToolsServer } from "./core/auto-start";
import { createDataUri } from "./core/data-uri";
import { resolveOptions } from "./core/options";
import { generateConnectSnippet } from "./core/snippet";
import type { DevToolsPluginOptions } from "./core/types";

/**
 * Webpack plugin for Nexus DevTools.
 * Injects `connectDevTools()` into the client entry in dev mode.
 *
 * @example
 * ```ts
 * // webpack.config.js
 * const { nexusDevTools } = require("@noverax/nexus-devtools/webpack")
 *
 * module.exports = {
 *   plugins: [nexusDevTools()],
 * }
 * ```
 */
export function nexusDevTools(options?: DevToolsPluginOptions): WebpackPluginLike {
  const resolved = resolveOptions(options);

  return {
    apply(compiler) {
      if (!resolved.enabled) return;

      if (resolved.autoStart) {
        startDevToolsServer(resolved);
      }

      // Skip server-side bundles
      if (compiler.options?.target === "node") return;

      const snippet = generateConnectSnippet(resolved);
      const dataUri = createDataUri(snippet);

      const originalEntry = compiler.options.entry;
      compiler.options.entry = async () => {
        const entries =
          typeof originalEntry === "function"
            ? await originalEntry()
            : (originalEntry as Record<string, WebpackEntryItem>);

        let main = entries["main-app"] ?? entries["main"];
        if (!main) {
          main = Object.values(entries)[0];
          console.warn(
            "[nexus-devtools] No 'main-app' or 'main' entry found, falling back to first entry",
          );
        }
        if (main?.import && !main.import.includes(dataUri)) {
          main.import.unshift(dataUri);
        }
        return entries;
      };
    },
  };
}

interface WebpackEntryItem {
  import?: string[];
  [key: string]: unknown;
}

interface WebpackPluginLike {
  apply(compiler: {
    options: { entry: unknown; target?: string };
    hooks?: { shutdown?: { tap(name: string, fn: () => void): void } };
  }): void;
}
