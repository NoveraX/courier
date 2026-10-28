/**
 * @vitest-environment node
 *
 * `@noverax/courier-nuxt/plugin`: the module that hands Nuxt's Vite builder
 * the plugin that builds the routes a page's proxy client may call, and
 * says what to do instead under another builder.
 */
import type { PluginOption } from "vite";
import { describe, expect, it } from "vitest";

import { courierRoutesModule, UnsupportedBuilderError } from "../src/plugin";

function nuxt(builder?: string): {
  options: { builder?: string; vite: { plugins?: PluginOption[] } };
} {
  return { options: { ...(builder !== undefined && { builder }), vite: {} } };
}

describe("courierRoutesModule", () => {
  it("adds the routes plugin to Nuxt's Vite builder", () => {
    const app = nuxt("@nuxt/vite-builder");

    courierRoutesModule({}, app);

    expect(app.options.vite.plugins).toEqual([expect.objectContaining({ name: "courier-routes" })]);
  });

  it("adds it under the builder Nuxt uses when its config names none", () => {
    const app = nuxt();

    courierRoutesModule({ config: "config/courier.config.ts" }, app);

    expect(app.options.vite.plugins).toHaveLength(1);
  });

  it("refuses another builder, saying how its proxy clients get the routes", () => {
    const refuse = () => courierRoutesModule({}, nuxt("@nuxt/webpack-builder"));

    expect(refuse).toThrow(UnsupportedBuilderError);
    expect(refuse).toThrow(/builds with @nuxt\/webpack-builder.*courier-cli routes/);
  });

  it("names itself to Nuxt", async () => {
    await expect(courierRoutesModule.getMeta()).resolves.toEqual({ name: "courier-routes" });
  });
});
