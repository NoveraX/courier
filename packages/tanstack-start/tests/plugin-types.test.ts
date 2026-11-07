/**
 * The routes plugins are what Rsbuild and Vite take for plugins, by their
 * own types: this file compiles only while they are. A list typed as the
 * bundler's, and a plugin of the app's own that sets ours up from its own
 * `setup`, take them as `defineConfig` does.
 */
import type { RsbuildPlugin } from "@rsbuild/core";
import type { Plugin, PluginOption } from "vite";
import { describe, expect, it } from "vitest";

import { courierRoutes as vitePlugin } from "../src/plugin";
import { courierRoutes as rsbuildPlugin } from "../src/rsbuild";

describe("the routes plugins, by the bundlers' own types", () => {
  it("are an Rsbuild plugin, alone, in a list of them and inside the app's own", () => {
    const plugin: RsbuildPlugin = rsbuildPlugin();
    const plugins: RsbuildPlugin[] = [rsbuildPlugin()];
    const wrapped: RsbuildPlugin = {
      name: "app-plugins",
      setup(api) {
        rsbuildPlugin().setup(api);
      },
    };

    expect([plugin, ...plugins, wrapped].map((each) => each.name)).toEqual([
      "courier-routes",
      "courier-routes",
      "app-plugins",
    ]);
  });

  it("are a Vite plugin, alone and in a list of them", () => {
    const plugin: Plugin = vitePlugin();
    const plugins: PluginOption[] = [vitePlugin()];

    expect(plugin.name).toBe("courier-routes");
    expect(plugins).toHaveLength(1);
  });
});
