import { createLogger } from "@noverax/courier";
import { createDataUri } from "./core/data-uri";
import { resolveSnippet } from "./core/resolve-snippet";
import type { StudioPluginOptions } from "./core/types";

const FRAMEWORK = "webpack";
const log = createLogger("WebpackPlugin");

/**
 * Webpack plugin for Courier Studio.
 * Injects `attachRuntime("webpack-browser")` into the client entry in dev mode.
 *
 * @example
 * ```ts
 * // webpack.config.js
 * const { courierStudio } = require("@noverax/courier-studio/webpack")
 *
 * module.exports = {
 *   plugins: [courierStudio()],
 * }
 * ```
 */
export function courierStudio(options?: StudioPluginOptions): WebpackPluginLike {
  return {
    apply(compiler) {
      if (compiler.options?.target === "node") return;

      const originalEntry = compiler.options.entry;
      compiler.options.entry = async () => {
        const entries =
          typeof originalEntry === "function"
            ? await originalEntry()
            : (originalEntry as Record<string, WebpackEntryItem>);

        const snippet = await resolveSnippet(FRAMEWORK, options);
        if (!snippet) return entries;

        const dataUri = createDataUri(snippet);
        let main = entries["main-app"] ?? entries["main"];
        if (!main) {
          main = Object.values(entries)[0];
          log.warn("No 'main-app' or 'main' entry found, falling back to first entry");
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
