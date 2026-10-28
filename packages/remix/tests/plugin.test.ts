/**
 * @vitest-environment node
 *
 * `@noverax/courier-remix/plugin`: the plugin that builds the routes a page's
 * proxy client may call, for the Vite config of a React Router app or of a Remix app on Vite.
 */
import { courierRoutes as routesPlugin } from "@noverax/courier-build/vite";
import { describe, expect, it } from "vitest";

import { courierRoutes } from "../src/plugin";

describe("courierRoutes from the React Router and Remix package", () => {
  it("is the Vite plugin that builds the routes from the config", () => {
    expect(courierRoutes).toBe(routesPlugin);
    expect(courierRoutes().name).toBe("courier-routes");
  });
});
