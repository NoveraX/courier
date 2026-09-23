import type { NextConfig } from "next";
import { createDataUri } from "./core/data-uri";
import { resolveSnippet } from "./core/resolve-snippet";
import { runtimeEntryPath } from "./core/runtime-importer";
import { hintClientInstrumentation } from "./core/turbopack-hint";
import type { StudioPluginOptions } from "./core/types";
import { prependToEntry, type WebpackEntryValue } from "./core/webpack-entry";

const FRAMEWORK = "next";

/** The client entries of the App Router and of the Pages Router. */
const CLIENT_ENTRIES = ["main-app", "main"] as const;

/**
 * Next.js config wrapper for Courier Studio.
 *
 * Under webpack — the default before Next.js 16, and `next dev --webpack`
 * since — it loads the Studio connection ahead of the client entries, as the
 * `next-browser` runtime. Turbopack runs no webpack hooks, so under it the
 * wrapper leaves the config as it is (a webpack hook would stop Next.js 16
 * from starting) and says how to connect the browser instead: from
 * `instrumentation-client.ts`.
 *
 * The server side attaches on its own, from `instrumentation.ts`.
 *
 * @param pluginOptions - `enabled` forces injection on or off; by default it is
 *   on unless `NODE_ENV` is `"production"`.
 * @returns A function that wraps a Next.js config.
 *
 * @example
 * ```ts
 * // next.config.ts
 * import { withCourierStudio } from "@noverax/courier-studio/next"
 *
 * export default withCourierStudio()({})
 * ```
 */
export function withCourierStudio(
  pluginOptions?: StudioPluginOptions,
): (nextConfig: NextConfig) => NextConfig {
  return (nextConfig) => {
    if (process.env.TURBOPACK) {
      hintClientInstrumentation(pluginOptions);
      return nextConfig;
    }
    return {
      ...nextConfig,
      webpack(webpackConfig, context) {
        if (!context.isServer) {
          const originalEntry = webpackConfig.entry;
          webpackConfig.entry = async () => {
            const entries: Record<string, WebpackEntryValue> =
              typeof originalEntry === "function" ? await originalEntry() : originalEntry;
            const snippet = await resolveSnippet(FRAMEWORK, pluginOptions, runtimeEntryPath());
            if (!snippet) return entries;
            const dataUri = createDataUri(snippet);
            for (const name of CLIENT_ENTRIES) {
              const entry = entries[name];
              if (entry !== undefined) entries[name] = prependToEntry(entry, dataUri);
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
