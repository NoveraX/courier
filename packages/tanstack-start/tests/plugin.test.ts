/**
 * @vitest-environment node
 *
 * `@noverax/courier-tanstack-start/plugin` and `/rsbuild`: the plugins that
 * build the routes a page's proxy client may call, for a TanStack Start
 * app built with Vite and for one built with Rsbuild.
 */
import { courierRoutes as rsbuildRoutes } from "@noverax/courier-build/rsbuild";
import { courierRoutes as viteRoutes } from "@noverax/courier-build/vite";
import { describe, expect, it } from "vitest";

import { courierRoutes as fromPlugin } from "../src/plugin";
import { courierRoutes as fromRsbuild } from "../src/rsbuild";

describe("the TanStack Start package's routes plugins", () => {
  it("are, for Vite, the plugin that builds the routes from the config", () => {
    expect(fromPlugin).toBe(viteRoutes);
    expect(fromPlugin().name).toBe("courier-routes");
  });

  it("are, for Rsbuild, the plugin that builds them there, by its name", () => {
    expect(fromRsbuild().name).toBe(rsbuildRoutes().name);
    expect(fromRsbuild().name).toBe("courier-routes");
  });
});
