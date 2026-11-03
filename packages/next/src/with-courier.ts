import type { CourierRoutesOptions } from "@noverax/courier-build/webpack";

import { type NextConfigShape, withRoutesConfig } from "./with-routes-config";

/**
 * A Next.js config as `withCourier` takes it: the config's object, whatever
 * keys of the app's own it holds. A config written as a function calls
 * `withCourier` on the object it returns; the function itself is refused.
 */
export type NextConfigObject<TConfig> = TConfig extends (...args: never[]) => unknown
  ? never
  : TConfig & NextConfigShape;

/**
 * Have Next.js build, under Turbopack and under webpack alike, the routes a
 * page's proxy client may call from `courier.config.ts`, in place of the
 * module `@noverax/courier/routes` ships: for the pages, the server that
 * renders them, and the Pages Router, whose server takes the package into
 * its bundle so the routes reach it too. No routes file is written. A page
 * that takes the config itself fails to build. A config written as a
 * function passes it the object it returns.
 *
 * @param nextConfig - The app's config
 * @param options - Where the config is, when it is not found from the app's folder
 * @returns The config, with Courier's rules beside the app's own
 * @throws ExternalCoreError when `serverExternalPackages` keeps `@noverax/courier` out of the server's bundle
 * @throws ConfigOutsideRootError when the config lies outside `turbopack.root`
 * @throws TypeError for a config written as a function, handed over itself
 * @example
 * ```ts
 * // next.config.ts
 * import { withCourier } from "@noverax/courier-next/plugin";
 *
 * export default withCourier({ reactStrictMode: true });
 * ```
 */
export function withCourier<TConfig extends object>(
  nextConfig: NextConfigObject<TConfig>,
  options: CourierRoutesOptions = {},
): TConfig & NextConfigShape {
  return withRoutesConfig(nextConfig, options, process.cwd());
}
