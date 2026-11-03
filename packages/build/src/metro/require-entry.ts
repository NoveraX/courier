import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { MetroConfigShape } from "./metro-config-shape";
import type { MetroRoutesOptions } from "./metro-routes-options";

/**
 * `withCourier()` for a `metro.config.js` that `require()`s it, as most do:
 * built as CommonJS, it hands the work to the package's ES module beside it,
 * which every Node the package runs on imports, `require(esm)` or not.
 *
 * @param config - The Metro config, or a promise of it
 * @param options - Where the config is, and where the module is written
 * @returns The config, with the resolver that answers the routes
 * @example
 * ```js
 * const { withCourier } = require("@noverax/courier-build/metro");
 * module.exports = withCourier(getDefaultConfig(__dirname));
 * ```
 */
export async function withCourier<TConfig extends MetroConfigShape>(
  config: TConfig | Promise<TConfig>,
  options: MetroRoutesOptions = {},
): Promise<TConfig & MetroConfigShape> {
  const loaded: unknown = await import(pathToFileURL(join(__dirname, "index.js")).href);
  const run: unknown =
    typeof loaded === "object" && loaded !== null ? Reflect.get(loaded, "withCourier") : undefined;
  if (typeof run !== "function") {
    throw new Error(
      "[courier] @noverax/courier-build is installed incompletely: install it again.",
    );
  }
  const result: unknown = await Reflect.apply(run, undefined, [config, options]);
  return result as TConfig & MetroConfigShape;
}
