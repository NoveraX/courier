import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { RoutesLoaderContext } from "./routes-loader-context";

/* What the loader's ES module exports: built beside this file, which is built as CommonJS. */
type RunRoutesLoader = (context: RoutesLoaderContext) => Promise<string>;

/**
 * The loader webpack, Rspack and Turbopack run on the module
 * `@noverax/courier/routes` ships, which they load as CommonJS: it hands the
 * work to the package's ES modules. Its result is never kept for the same
 * inputs, as the routes may follow a variable the config reads, which no
 * bundler sees; the engine reads them again only when what they came from
 * has changed.
 *
 * @example
 * ```ts
 * config.module.rules.push({ test: stubFile, use: [{ loader: routesLoaderFile(), options: { root } }] });
 * ```
 */
// biome-ignore lint/style/noDefaultExport: webpack, Rspack and Turbopack take a loader as its module itself
export default function courierRoutesLoader(this: RoutesLoaderContext): void {
  this.cacheable(false);
  const done = this.async();
  const runner = pathToFileURL(join(__dirname, "run-routes-loader.js")).href;
  import(runner)
    .then((module: unknown) => runnerOf(module)(this))
    .then(
      (code) => done(null, code),
      (error: unknown) => done(error instanceof Error ? error : new Error(String(error))),
    );
}

function runnerOf(module: unknown): RunRoutesLoader {
  const run: unknown =
    typeof module === "object" && module !== null
      ? Reflect.get(module, "runRoutesLoader")
      : undefined;
  if (typeof run !== "function") {
    throw new Error(
      "[courier] @noverax/courier-build is installed incompletely: install it again.",
    );
  }
  return async (context) => {
    const code: unknown = await Reflect.apply(run, undefined, [context]);
    if (typeof code !== "string") throw new Error("[courier] The routes loader built no module.");
    return code;
  };
}
