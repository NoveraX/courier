import type { NextConfig } from "next";
import { createDataUri } from "./core/data-uri";
import { resolveSnippet } from "./core/resolve-snippet";
import { runtimeEntryPath } from "./core/runtime-importer";
import { hintClientInstrumentation } from "./core/turbopack-hint";
import type { StudioPluginOptions } from "./core/types";
import { isEntryRecord, isEntryValue, prependToEntry } from "./core/webpack-entry";
import { wsExternal } from "./core/ws-external";

const FRAMEWORK = "next";

/** The client entries of the App Router and of the Pages Router. */
const CLIENT_ENTRIES = ["main-app", "main"] as const;

/* The fields of webpack's config the wrapper reads and replaces; Next.js types
   the config it hands over as `any`. */
interface WebpackConfigFields {
  entry?: unknown;
  externals?: unknown;
}

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
 * The server side attaches on its own, from `instrumentation.ts`. Under
 * webpack the wrapper keeps `ws`, which the server's Studio socket runs on,
 * out of the Node server bundle: bundled, it fails on every frame of 48
 * bytes or more, and the server runtime would never reach Studio.
 *
 * @param pluginOptions - `enabled` forces injection on or off; by default it is
 *   on in `next dev` unless `NODE_ENV` is `"production"`.
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
      webpack(webpackConfig: WebpackConfigFields, context) {
        if (!context.isServer) {
          const originalEntry = webpackConfig.entry;
          webpackConfig.entry = async () => {
            const entries: unknown =
              typeof originalEntry === "function" ? await originalEntry() : originalEntry;
            if (!isEntryRecord(entries)) return entries;
            const snippet = await resolveSnippet({
              framework: FRAMEWORK,
              options: pluginOptions,
              development: context.dev,
              runtime: runtimeEntryPath(),
            });
            if (!snippet) return entries;
            const dataUri = createDataUri(snippet);
            for (const name of CLIENT_ENTRIES) {
              const entry = entries[name];
              if (isEntryValue(entry)) entries[name] = prependToEntry(entry, dataUri);
            }
            return entries;
          };
        } else if (context.nextRuntime !== "edge") {
          webpackConfig.externals = [...externalsOf(webpackConfig.externals), wsExternal];
        }
        if (typeof nextConfig.webpack === "function") {
          return nextConfig.webpack(webpackConfig, context);
        }
        return webpackConfig;
      },
    };
  };
}

/* webpack takes one external, or a list of them. */
function externalsOf(externals: unknown): unknown[] {
  if (externals === undefined) return [];
  return Array.isArray(externals) ? externals : [externals];
}
