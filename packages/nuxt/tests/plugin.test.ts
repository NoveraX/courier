/**
 * @vitest-environment node
 *
 * `@noverax/courier-nuxt/plugin`: the module that hands Nuxt's Vite builder
 * the plugin that builds the routes a page's proxy client may call, hands
 * the webpack and Rspack builders the rules that do the same in each of
 * their bundles, and says what to do instead under another builder.
 * Requires a build of `@noverax/courier-build` first.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { PluginOption } from "vite";
import { afterEach, describe, expect, it } from "vitest";

import type { NuxtBundlerConfig } from "../src/bundler-routes-hook";
import { courierRoutesModule, UnsupportedBuilderError } from "../src/plugin";

/* The repository's packages of Courier, which an app's `@noverax/*` resolve to. */
const REPO_NOVERAX = resolve(import.meta.dirname, "../../../node_modules/@noverax");

type Hook = (configs: NuxtBundlerConfig[]) => void;

let root: string | undefined;

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function nuxt(builder?: string, rootDir = "/app") {
  const hooks = new Map<string, Hook>();
  return {
    hooks,
    options: {
      ...(builder !== undefined && { builder }),
      rootDir,
      vite: {} as { plugins?: PluginOption[] },
    },
    hook: (name: "webpack:config" | "rspack:config", run: Hook) => {
      hooks.set(name, run);
    },
  };
}

/* An app with a config, whose `@noverax/*` are the repository's. */
function app(): string {
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-nuxt-plugin-")));
  mkdirSync(join(root, "node_modules"));
  symlinkSync(REPO_NOVERAX, join(root, "node_modules/@noverax"), "dir");
  writeFileSync(join(root, "courier.config.mjs"), "export default { sources: {} };\n");
  return root;
}

describe("courierRoutesModule", () => {
  it("adds the routes plugin to Nuxt's Vite builder", () => {
    const nuxtApp = nuxt("@nuxt/vite-builder");

    courierRoutesModule({}, nuxtApp);

    expect(nuxtApp.options.vite.plugins).toEqual([
      expect.objectContaining({ name: "courier-routes" }),
    ]);
  });

  it("adds it under the builder Nuxt uses when its config names none", () => {
    const nuxtApp = nuxt();

    courierRoutesModule({ config: "config/courier.config.ts" }, nuxtApp);

    expect(nuxtApp.options.vite.plugins).toHaveLength(1);
  });

  it.each([
    ["@nuxt/webpack-builder", "webpack:config"],
    ["@nuxt/rspack-builder", "rspack:config"],
  ])(
    "hands %s's bundles the routes rule, and the pages' the refusal of the config",
    (builder, hook) => {
      const nuxtApp = nuxt(builder, app());
      courierRoutesModule({}, nuxtApp);
      const client: NuxtBundlerConfig = { name: "client" };
      const server: NuxtBundlerConfig = { name: "server", module: { rules: [{ test: /\.vue$/ }] } };

      nuxtApp.hooks.get(hook)?.([client, server]);

      expect(client.module?.rules).toHaveLength(2);
      expect(server.module?.rules).toHaveLength(2);
      expect(server.module?.rules?.[0]).toEqual({ test: /\.vue$/ });
      expect(nuxtApp.options.vite.plugins).toBeUndefined();
    },
  );

  it("refuses another builder, saying how its proxy clients get the routes", () => {
    const refuse = () => courierRoutesModule({}, nuxt("@acme/nuxt-builder"));

    expect(refuse).toThrow(UnsupportedBuilderError);
    expect(refuse).toThrow(/builds with @acme\/nuxt-builder.*courier-cli routes/);
  });

  it("names itself to Nuxt", async () => {
    await expect(courierRoutesModule.getMeta()).resolves.toEqual({ name: "courier-routes" });
  });
});
