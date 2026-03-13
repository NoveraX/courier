import type { NextConfig } from "next";
import { createDataUri } from "./core/data-uri";
import { resolveOptions } from "./core/options";
import { generateConnectSnippet } from "./core/snippet";
import type { DevToolsPluginOptions } from "./core/types";

/**
 * Next.js config wrapper for Nexus DevTools (webpack mode only).
 * Injects `connectDevTools()` into the client webpack bundle in dev mode.
 *
 * **Turbopack** ignores `webpack()` config — use `instrumentation-client.ts` instead:
 * ```ts
 * import { connectDevTools } from "@noverax/nexus-devtools-core"
 * connectDevTools()
 * ```
 *
 * **Server** — run separately: `npx nexus-devtools` or `npm run devtools`
 *
 * @example
 * ```ts
 * // next.config.ts (webpack mode)
 * import { withNexusDevTools } from "@noverax/nexus-devtools/next"
 * export default withNexusDevTools()({ ... })
 * ```
 */
export function withNexusDevTools(pluginOptions?: DevToolsPluginOptions) {
  const resolved = resolveOptions(pluginOptions);

  return (nextConfig: NextConfig): NextConfig => {
    if (!resolved.enabled) return nextConfig;

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
