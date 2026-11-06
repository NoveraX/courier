import { withCourier } from "@noverax/courier-next/plugin";

/* With the source maps of what a page loads, which the bundle check reads to tell Courier's code
   from the application's own libraries. */
export default withCourier({ productionBrowserSourceMaps: true });
