/**
 * @vitest-environment node
 *
 * `withCourier`'s config: webpack's rules after the app's own, the refusal
 * of the config in a page's bundle only, Turbopack's rules under the key
 * the app's Next.js reads them from, the core taken into the Pages Router
 * server's bundle, and the setups that cannot work refused with why.
 * Requires a build of `@noverax/courier-build` first.
 */
import { join } from "node:path";
import { routesLoaderFile } from "@noverax/courier-build/webpack";
import { afterEach, describe, expect, it } from "vitest";

import { ConfigOutsideRootError } from "../src/config-outside-root-error";
import { ExternalCoreError } from "../src/external-core-error";
import { withRoutesConfig } from "../src/with-routes-config";
import { type RoutesApp, routesApp } from "./fixtures/routes-app";

const STUB_GLOB = "**/node_modules/@noverax/courier/lib/routes/index.js";

let app: RoutesApp | undefined;

afterEach(() => {
  app?.remove();
  app = undefined;
});

interface Rule {
  test?: string;
  use?: Array<{ loader: string; options: Record<string, unknown> }>;
}

/* The rules the config's webpack function gives a bundle, a page's or a server's. */
function webpackRules(config: { webpack?: unknown }, root: string, isServer: boolean): Rule[] {
  const webpack = config.webpack;
  if (typeof webpack !== "function") throw new Error("no webpack function");
  const built: unknown = Reflect.apply(webpack, undefined, [
    { module: { rules: [] } },
    { dir: root, isServer },
  ]);
  const rules: unknown = Reflect.get(Reflect.get(built as object, "module") as object, "rules");
  return rules as Rule[];
}

describe("withRoutesConfig", () => {
  it("adds the routes rule to every bundle, and refuses the config in a page's alone", () => {
    app = routesApp();
    const config = withRoutesConfig({}, {}, app.root);

    const page = webpackRules(config, app.root, false);
    const server = webpackRules(config, app.root, true);

    expect(page.map((rule) => rule.use?.[0]?.options.refuse)).toEqual([
      undefined,
      "config-in-page",
    ]);
    expect(server).toHaveLength(1);
    expect(server[0]?.test).toMatch(/core\/lib\/routes\/index\.js$/);
    expect(server[0]?.use?.[0]?.loader).toBe(routesLoaderFile());
  });

  it("runs the app's own webpack function first, and keeps what it added", () => {
    app = routesApp();
    const own = (webpackConfig: { module: { rules: unknown[] } }) => {
      webpackConfig.module.rules.push({ test: /\.svg$/ });
      return webpackConfig;
    };

    const rules = webpackRules(withRoutesConfig({ webpack: own }, {}, app.root), app.root, true);

    expect(rules[0]).toEqual({ test: /\.svg$/ });
    expect(rules).toHaveLength(2);
  });

  it("fails with why when the app's webpack function returns no config", () => {
    app = routesApp();
    const config = withRoutesConfig({ webpack: () => undefined }, {}, app.root);

    expect(() => webpackRules(config, app?.root ?? "", true)).toThrow(
      "The app's webpack function returned no config",
    );
  });

  it("takes the core into the server's bundle once, beside the app's own packages", () => {
    app = routesApp();

    const config = withRoutesConfig(
      { transpilePackages: ["ui", "@noverax/courier"] },
      {},
      app.root,
    );

    expect(config.transpilePackages).toEqual(["ui", "@noverax/courier"]);
    expect(withRoutesConfig({}, {}, app.root).transpilePackages).toEqual(["@noverax/courier"]);
  });

  it("puts Turbopack's rules under turbopack from Next.js 15.3, beside the app's own", () => {
    app = routesApp("15.3.0");

    const config = withRoutesConfig(
      { turbopack: { rules: { "*.svg": { loaders: ["svgr"] } } } },
      {},
      app.root,
    );

    expect(Object.keys(config.turbopack?.rules ?? {})).toEqual([
      "*.svg",
      STUB_GLOB,
      "courier.config.mjs",
    ]);
  });

  it("puts them under experimental.turbo before 15.3, as Next.js 14 reads them", () => {
    app = routesApp("14.2.35");

    const config = withRoutesConfig({ experimental: { typedRoutes: true } }, {}, app.root);

    expect(config.turbopack).toBeUndefined();
    expect(config.experimental).toMatchObject({
      typedRoutes: true,
      turbo: { rules: { [STUB_GLOB]: { as: "*.js" } } },
    });
  });

  it("names a page's bundle by the rule's condition from Next.js 16, and by its key before", () => {
    app = routesApp("16.0.0");
    const current = withRoutesConfig({}, {}, app.root).turbopack?.rules?.["courier.config.mjs"];
    app.remove();
    app = routesApp("15.5.28");
    const earlier = withRoutesConfig({}, {}, app.root).turbopack?.rules?.["courier.config.mjs"];

    expect(current).toMatchObject({ condition: "browser", as: "*.js" });
    expect(earlier).toMatchObject({ browser: { as: "*.js" } });
  });

  it("hands Turbopack's loader its options as JSON alone, with no key left undefined", () => {
    app = routesApp();

    const rule = withRoutesConfig({}, {}, app.root).turbopack?.rules?.[STUB_GLOB];

    expect(rule).toEqual({
      loaders: [{ loader: routesLoaderFile(), options: { root: app.root } }],
      as: "*.js",
    });
  });

  it("refuses an app that keeps the core out of its server's bundle", () => {
    app = routesApp();
    const root = app.root;

    expect(() =>
      withRoutesConfig({ serverExternalPackages: ["@noverax/courier"] }, {}, root),
    ).toThrow(ExternalCoreError);
    expect(() =>
      withRoutesConfig(
        { experimental: { serverComponentsExternalPackages: ["@noverax/courier"] } },
        {},
        root,
      ),
    ).toThrow(ExternalCoreError);
  });

  it("refuses a config outside turbopack.root, where Turbopack follows no file", () => {
    app = routesApp("16.4.4", { "web/package.json": "{}" });
    const root = app.root;

    expect(() => withRoutesConfig({ turbopack: { root: join(root, "web") } }, {}, root)).toThrow(
      ConfigOutsideRootError,
    );
    expect(() => withRoutesConfig({ turbopack: { root } }, {}, root)).not.toThrow();
  });
});
