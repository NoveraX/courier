import { Transformer } from "@parcel/plugin";

import { type ParcelRoutesOptions, routesOptionsOf } from "./routes-options";
import { transformRoutesAsset } from "./transform-routes-asset";

/**
 * The Parcel transformer that builds the routes a page's proxy client may
 * call from `courier.config.ts`, in place of the module
 * `@noverax/courier/routes` ships, and fails a browser's bundle that takes
 * the config itself. `.parcelrc` runs it on both.
 *
 * @example
 * ```json
 * {
 *   "extends": "@parcel/config-default",
 *   "transformers": {
 *     "**\/@noverax/courier/lib/routes/index.js": ["@noverax/parcel-transformer-courier", "..."],
 *     "**\/courier.config.{ts,mts,cts,js,mjs,cjs}": ["@noverax/parcel-transformer-courier", "..."]
 *   }
 * }
 * ```
 */
const courierTransformer: Transformer<ParcelRoutesOptions> = new Transformer({
  loadConfig: ({ config }) => routesOptionsOf(config, process.cwd()),
  transform: ({ asset, config, options, logger }) =>
    transformRoutesAsset(asset, { options, logger, config: config.config }),
});

// biome-ignore lint/style/noDefaultExport: Parcel takes a transformer as the package's export itself
export default courierTransformer;
