import { createLogger } from "@noverax/courier";
import { createDataUri } from "./core/data-uri";
import { isInjectionEnabled } from "./core/options";
import { resolveSnippet } from "./core/resolve-snippet";
import { runtimeEntryPath } from "./core/runtime-importer";
import type { StudioPluginOptions } from "./core/types";
import { isEntryRecord, isEntryValue, prependToEntry } from "./core/webpack-entry";

const FRAMEWORK = "webpack";
const log = createLogger("WebpackPlugin");

/**
 * Webpack plugin for Courier Studio.
 *
 * Loads the Studio connection ahead of the app's main entry — `main-app` or
 * `main`, else the first — as the `webpack-browser` runtime, in a build whose
 * `mode` is `"development"`. Production builds, which is what webpack makes
 * when no `mode` is set, and builds for `target: "node"` are left untouched.
 *
 * @param options - `enabled` forces injection on or off; by default it is on
 *   in development mode unless `NODE_ENV` is `"production"`.
 * @returns The webpack plugin.
 *
 * @example
 * ```ts
 * // webpack.config.mjs
 * import { courierStudio } from "@noverax/courier-studio/webpack"
 *
 * export default {
 *   plugins: [courierStudio()],
 * }
 * ```
 */
export function courierStudio(options?: StudioPluginOptions): WebpackPluginLike {
  return {
    apply(compiler) {
      if (compiler.options?.target === "node") return;
      const development = compiler.options.mode === "development";
      if (!isInjectionEnabled(options, development)) return;

      const originalEntry = compiler.options.entry;
      compiler.options.entry = async () => {
        const entries: unknown =
          typeof originalEntry === "function" ? await originalEntry() : originalEntry;
        if (!isEntryRecord(entries)) {
          log.warn("The webpack entry names no entries; Studio does not connect");
          return entries;
        }

        const snippet = await resolveSnippet({
          framework: FRAMEWORK,
          options,
          development,
          runtime: runtimeEntryPath(),
        });
        if (!snippet) return entries;

        const name = mainEntryName(entries);
        if (name === undefined) return entries;
        const entry = entries[name];
        if (isEntryValue(entry)) entries[name] = prependToEntry(entry, createDataUri(snippet));
        return entries;
      };
    },
  };
}

function mainEntryName(entries: Record<string, unknown>): string | undefined {
  if ("main-app" in entries) return "main-app";
  if ("main" in entries) return "main";
  const [first] = Object.keys(entries);
  if (first !== undefined)
    log.warn(`No 'main-app' or 'main' entry; Studio connects through '${first}'`);
  return first;
}

interface WebpackPluginLike {
  apply(compiler: { options: { entry: unknown; mode?: unknown; target?: unknown } }): void;
}
