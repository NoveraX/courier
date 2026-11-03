/**
 * The Next.js plugin that builds the routes each page's proxy client may
 * call from `courier.config.ts`, under Turbopack and webpack alike, for the
 * pages and the server that renders them. No routes file is written.
 *
 * @example
 * ```ts
 * // next.config.ts
 * import { withCourier } from "@noverax/courier-next/plugin";
 *
 * export default withCourier({});
 * ```
 */
export type { CourierRoutesOptions } from "@noverax/courier-build/webpack";
export {
  type ConfigOutsideRootContext,
  ConfigOutsideRootError,
} from "./config-outside-root-error";
export { ExternalCoreError } from "./external-core-error";
export { type NextConfigObject, withCourier } from "./with-courier";
export type { NextConfigShape } from "./with-routes-config";
