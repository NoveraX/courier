/**
 * The Rspack plugin that builds the routes a page's proxy client may call
 * from `courier.config.ts`: the webpack plugin, which Rspack runs as it is.
 *
 * @example
 * ```ts
 * // rspack.config.mjs
 * import { CourierRoutesPlugin } from "@noverax/courier-build/rspack";
 *
 * export default { plugins: [new CourierRoutesPlugin()] };
 * ```
 */
export {
  type CourierRoutesOptions,
  CourierRoutesPlugin,
  type RoutesCompiler,
} from "../webpack/index";
