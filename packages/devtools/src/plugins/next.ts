import type { NextConfig } from "next";
import { startDevToolsServer } from "./core/auto-start";
import { createDataUri } from "./core/data-uri";
import { resolveOptions } from "./core/options";
import { generateConnectSnippet } from "./core/snippet";
import type { DevToolsPluginOptions } from "./core/types";

/**
 * Next.js config wrapper for Nexus DevTools.
 * Injects `connectDevTools()` into the client webpack bundle in dev mode.
 *
 * @example
 * ```ts
 * // next.config.ts
 * import { withNexusDevTools } from "@noverax/nexus-devtools/next"
 *
 * export default withNexusDevTools()({
 *   // your Next.js config
 * })
 * ```
 */
export function withNexusDevTools(pluginOptions?: DevToolsPluginOptions) {
  const resolved = resolveOptions(pluginOptions);

  return (nextConfig: NextConfig): NextConfig => {
    if (!resolved.enabled) return nextConfig;

    if (resolved.autoStart) {
      startDevToolsServer(resolved);
    }

    const snippet = generateConnectSnippet(resolved);
    const dataUri = createDataUri(snippet);

    return {
      ...nextConfig,
      webpack(webpackConfig, context) {
        // Only inject into client bundle
        if (!context.isServer) {
          const originalEntry = webpackConfig.entry as WebpackEntries;
          webpackConfig.entry = async () => {
            const entries =
              typeof originalEntry === "function" ? await originalEntry() : originalEntry;
            const main = entries["main-app"] ?? entries["main"];
            if (main && Array.isArray(main.import) && !main.import.includes(dataUri)) {
              main.import.unshift(dataUri);
            }
            return entries;
          };
        }

        if (typeof nextConfig.webpack === "function") {
          return nextConfig.webpack(webpackConfig, context);
        }
        return webpackConfig;
      },
    };
  };
}

interface WebpackEntry {
  import: string[];
  [key: string]: unknown;
}

type WebpackEntries = Record<string, WebpackEntry> | (() => Promise<Record<string, WebpackEntry>>);
