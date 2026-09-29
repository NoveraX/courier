/**
 * The Studio Nuxt module, against the Nuxt instance it is installed into.
 *
 * It registered no plugin, and the file it generated was a syntax error, so a
 * Nuxt app never connected to Studio.
 */
import { tmpdir } from "node:os";
import { parseSync } from "oxc-parser";
import { describe, expect, it } from "vitest";

import { courierStudioModule } from "../src/plugins/nuxt";

function fakeNuxt(builder: string) {
  return {
    options: {
      dev: true,
      builder,
      buildDir: tmpdir(),
      build: { templates: [] as Array<{ getContents: () => string }> },
      plugins: [] as unknown[],
      vite: {} as { plugins?: unknown[] },
    },
  };
}

describe("courierStudioModule for Nuxt", () => {
  it("hands Vite, Nuxt's default builder, the Studio Vite plugin", async () => {
    const nuxt = fakeNuxt("@nuxt/vite-builder");

    await courierStudioModule({ enabled: true }, nuxt);

    expect(nuxt.options.vite.plugins).toEqual([
      expect.objectContaining({ name: "courier-studio" }),
    ]);
    expect(nuxt.options.plugins).toEqual([]);
  });

  it("registers a client plugin that parses, under the other builders", async () => {
    const nuxt = fakeNuxt("@nuxt/webpack-builder");

    await courierStudioModule({ enabled: true }, nuxt);

    expect(nuxt.options.plugins).toEqual([expect.objectContaining({ mode: "client" })]);
    const source = nuxt.options.build.templates[0]?.getContents() ?? "";
    expect(parseSync("plugin.mjs", source).errors).toEqual([]);
    expect(source).toContain('attachRuntime("nuxt-browser")');
  });

  it("does nothing outside nuxt dev", async () => {
    const nuxt = { ...fakeNuxt("@nuxt/vite-builder") };
    nuxt.options.dev = false;

    await courierStudioModule({ enabled: true }, nuxt);

    expect(nuxt.options.vite.plugins).toBeUndefined();
  });
});
