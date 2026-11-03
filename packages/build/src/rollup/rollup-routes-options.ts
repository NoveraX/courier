import type { CourierRoutesOptions } from "../util/courier-routes-options";

/** Options of the routes plugin of Rollup and Rolldown. */
export interface RollupRoutesOptions extends CourierRoutesOptions {
  /**
   * The bundle is a server's, which may take the config itself: none is
   * refused. A page's by default, which must not.
   */
  server?: boolean | undefined;
}
