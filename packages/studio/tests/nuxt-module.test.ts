/**
 * The Studio Nuxt module, against the Nuxt instance it is installed into.
 *
 * It hands Vite, Nuxt's default builder, the Studio Vite plugin, registers a
 * client plugin that parses under the other builders, tells Nitro's worker
 * where the dev server listens, and does nothing outside `nuxt dev`.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { getAppOrigin, setAppOrigin } from "@noverax/courier";
import { DEV_SERVER_ORIGIN_ENV } from "@noverax/courier/internal";
import { parseSync } from "oxc-parser";
import { afterEach, describe, expect, it, vi } from "vitest";

import { courierStudioModule } from "../src/plugins/nuxt";

type ListenHook = (
  server: { address(): AddressInfo | string | null },
  listener?: { url?: string },
) => void;

function fakeNuxt(builder: string) {
  const hooks = new Map<string, ListenHook>();
  return {
    hooks,
    hook(name: string, run: ListenHook) {
      hooks.set(name, run);
    },
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

afterEach(() => {
  setAppOrigin(undefined);
  vi.unstubAllEnvs();
});

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

  it("tells the app, and Nitro's worker through the environment, where the dev server listens", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(DEV_SERVER_ORIGIN_ENV, "");
    delete process.env[DEV_SERVER_ORIGIN_ENV];
    const nuxt = fakeNuxt("@nuxt/vite-builder");
    await courierStudioModule({ enabled: true }, nuxt);
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;

    nuxt.hooks.get("listen")?.(server, { url: `http://localhost:${port}/` });
    server.close();

    expect(process.env[DEV_SERVER_ORIGIN_ENV]).toBe(`http://localhost:${port}`);
    expect(getAppOrigin()).toBe(`http://localhost:${port}`);
  });

  it("does nothing outside nuxt dev", async () => {
    const nuxt = { ...fakeNuxt("@nuxt/vite-builder") };
    nuxt.options.dev = false;

    await courierStudioModule({ enabled: true }, nuxt);

    expect(nuxt.options.vite.plugins).toBeUndefined();
    expect(nuxt.hooks.size).toBe(0);
  });
});
