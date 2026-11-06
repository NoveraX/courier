import { CourierError } from "@noverax/courier/server";

/**
 * The app keeps `@noverax/courier` out of its server's bundle, through
 * `serverExternalPackages`, so the server would load the routes module the
 * package ships, which holds no routes, in place of the one the plugin
 * builds.
 *
 * @example
 * ```ts
 * throw new ExternalCoreError();
 * ```
 */
export class ExternalCoreError extends CourierError<"CORE_EXTERNAL"> {
  constructor() {
    super(
      '[courier] withCourier() builds the routes into the server\'s bundle, and the app lists "@noverax/courier" in serverExternalPackages, which keeps the package out of it: remove it from that list.',
      { code: "CORE_EXTERNAL" },
    );
  }
}
