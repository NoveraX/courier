import type { CourierRoutesOptions } from "../util/courier-routes-options";

/** Options of the routes plugin of Metro and Expo. */
export interface MetroRoutesOptions extends CourierRoutesOptions {
  /**
   * The folder the routes module Metro bundles is written to, from the
   * project's root or absolute: `node_modules/.cache/@noverax/courier` by
   * default. Name another where `node_modules` cannot be written; one outside
   * the project and its watched folders is watched too.
   */
  outDir?: string | undefined;
}
