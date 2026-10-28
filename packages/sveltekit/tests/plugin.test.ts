/**
 * @vitest-environment node
 *
 * `@noverax/courier-sveltekit/plugin`: the plugin that builds the routes a page's
 * proxy client may call, for the app's Vite config beside SvelteKit's.
 */
import { courierRoutes as routesPlugin } from "@noverax/courier-build/vite";
import { describe, expect, it } from "vitest";

import { courierRoutes } from "../src/plugin";

describe("courierRoutes from the SvelteKit package", () => {
  it("is the Vite plugin that builds the routes from the config", () => {
    expect(courierRoutes).toBe(routesPlugin);
    expect(courierRoutes().name).toBe("courier-routes");
  });
});
