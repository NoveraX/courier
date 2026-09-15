import type { NextConfig } from "next";
import { createDataUri } from "./core/data-uri";
import { resolveSnippet } from "./core/resolve-snippet";
import type { StudioPluginOptions } from "./core/types";

const FRAMEWORK = "next";

/**
 * Next.js config wrapper for Nexus Studio (webpack mode only).
 * Injects `attachRuntime("next-browser")` into the client webpack bundle in dev mode.
 *
 * **Turbopack** ignores `webpack()` config — create `instrumentation-client.ts` instead:
 * ```ts
 * import { attachRuntime } from "@noverax/nexus-studio-core/runtime"
 * attachRuntime("next-browser")
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
  return (nextConfig: NextConfig): NextConfig => {
    return {
      ...nextConfig,
      webpack(webpackConfig, context) {
        if (!context.isServer) {
          const originalEntry = webpackConfig.entry as WebpackEntries;
          webpackConfig.entry = async () => {
            const entries =
              typeof originalEntry === "function" ? await originalEntry() : originalEntry;

            const snippet = await resolveSnippet(FRAMEWORK, pluginOptions);
            if (!snippet) return entries;

            const dataUri = createDataUri(snippet);
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
