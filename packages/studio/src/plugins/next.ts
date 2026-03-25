import type { NextConfig } from "next";
import { createDataUri } from "./core/data-uri";
import { resolveOptions } from "./core/options";
import { generateConnectSnippet } from "./core/snippet";
import type { StudioPluginOptions } from "./core/types";

/**
 * Next.js config wrapper for Nexus Studio (webpack mode only).
 * Injects `connectStudio()` into the client webpack bundle in dev mode.
 *
 * **Turbopack** ignores `webpack()` config — use `instrumentation-client.ts` instead:
 * ```ts
 * import { connectStudio } from "@noverax/nexus-studio-core"
 * connectStudio()
 * ```
 *
 * **Server** — run separately: `npx nexus-studio` or `npm run studio`
 *
 * @example
 * ```ts
 * // next.config.ts (webpack mode)
 * import { withNexusStudio } from "@noverax/nexus-studio/next"
 * export default withNexusStudio()({ ... })
 * ```
 */
export function withNexusStudio(pluginOptions?: StudioPluginOptions) {
  const resolved = { ...resolveOptions(pluginOptions), framework: "next-client" };

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
