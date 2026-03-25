import { createDataUri } from "./core/data-uri";
import { resolveOptions } from "./core/options";
import { generateConnectSnippet } from "./core/snippet";
import type { StudioPluginOptions } from "./core/types";

/**
 * Webpack plugin for Nexus Studio.
 * Injects `connectStudio()` into the client entry in dev mode.
 *
 * @example
 * ```ts
 * // webpack.config.js
 * const { nexusStudio } = require("@noverax/nexus-studio/webpack")
 *
 * module.exports = {
 *   plugins: [nexusStudio()],
 * }
 * ```
 */
export function nexusStudio(options?: StudioPluginOptions): WebpackPluginLike {
  const resolved = resolveOptions(options);

  return {
    apply(compiler) {
      if (!resolved.enabled) return;

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
            "[nexus-studio] No 'main-app' or 'main' entry found, falling back to first entry",
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
