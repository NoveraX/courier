/**
 * @vitest-environment node
 *
 * `withCourier` for Metro: the routes module it writes and resolves
 * `@noverax/courier/routes` to, every other module left to the app's
 * resolver or Metro's, the config refused in the app's bundle, a build that
 * fails while the routes cannot be read, the module kept current as the
 * files it came from change — saved in place or by replacing the file —
 * and a config loaded again that adds no watcher. Requires a build of this
 * package and of the core first.
 */
import { chmodSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MetroResolutionContext, MetroResolver } from "../../src/metro/metro-config-shape";
import { withCourier } from "../../src/metro/with-courier";
import { forgetRoutesFiles, routesFile } from "../../src/routes-file/routes-file";
import type { TempProject } from "../vite/temp-project";
import { CONFIG_JS } from "../webpack/js-project";
import { metroProject } from "./metro-project";

const MODULE = "node_modules/.cache/@noverax/courier/routes.js";

const ELSEWHERE = "withCourier(config, { outDir })";

/* Modes are POSIX's, and root may write anything. */
const posixUser = process.platform !== "win32" && process.getuid?.() !== 0;

let project: TempProject | undefined;

afterEach(() => {
  vi.restoreAllMocks();
  forgetRoutesFiles();
  project?.remove();
  project = undefined;
});

/* What Metro hands a resolver, for a bundle of the app or a server's. */
function contextOf(chain: MetroResolver, dev = true, environment?: string): MetroResolutionContext {
  return {
    dev,
    originModulePath: "/app/src/page.js",
    customResolverOptions: environment === undefined ? {} : { environment },
    resolveRequest: chain,
  };
}

const resolverOf = async (root: string, own?: MetroResolver): Promise<MetroResolver> => {
  const config = await withCourier({ projectRoot: root, resolver: { resolveRequest: own } });
  const resolve = config.resolver?.resolveRequest;
  if (typeof resolve !== "function") throw new Error("no resolver");
  return resolve;
};

/* The module as it is now, which the watchers rewrite a moment after a change. */
const moduleOf = (root: string): string => readFileSync(join(root, MODULE), "utf8");

/* Waited for as long as a loaded machine takes to see a change and read the config again. */
const REWRITTEN = { timeout: 30_000, interval: 50 };

describe("withCourier for Metro", () => {
  it("writes the routes to a module of the app's own, and resolves @noverax/courier/routes to it", async () => {
    project = metroProject();
    const metroDefault = vi.fn<MetroResolver>(() => ({ type: "sourceFile", filePath: "/x.js" }));

    const resolve = await resolverOf(project.root);

    expect(readFileSync(join(project.root, MODULE), "utf8")).toContain(
      '"cart.add":{"type":"mutation"}',
    );
    expect(resolve(contextOf(metroDefault), "@noverax/courier/routes", "ios")).toEqual({
      type: "sourceFile",
      filePath: join(project.root, MODULE),
    });
    expect(metroDefault).not.toHaveBeenCalled();
  }, 60_000);

  it("leaves every other module to the app's own resolver, or Metro's", async () => {
    project = metroProject();
    const own = vi.fn<MetroResolver>(() => ({ type: "sourceFile", filePath: "/own.js" }));
    const metroDefault = vi.fn<MetroResolver>(() => ({
      type: "sourceFile",
      filePath: "/metro.js",
    }));

    const withOwn = await resolverOf(project.root, own);
    const withNone = await resolverOf(project.root);

    expect(withOwn(contextOf(metroDefault), "react", "ios").filePath).toBe("/own.js");
    expect(withNone(contextOf(metroDefault), "react", "ios").filePath).toBe("/metro.js");
  }, 60_000);

  it("refuses the config in the app's bundle, and lets a server's take it", async () => {
    project = metroProject();
    const configFile = join(project.root, "courier.config.mjs");
    const metroDefault: MetroResolver = () => ({ type: "sourceFile", filePath: configFile });

    const resolve = await resolverOf(project.root);

    expect(() => resolve(contextOf(metroDefault), "../courier.config.mjs", "ios")).toThrow(
      "courier.config.mjs is imported into the app's bundle as a value",
    );
    expect(
      resolve(contextOf(metroDefault, true, "node"), "../courier.config.mjs", "web").filePath,
    ).toBe(configFile);
  }, 60_000);

  it("fails a build while the routes cannot be read, and hands a development bundle the module that says why", async () => {
    project = metroProject({ "src/apis.mjs": "export const shop = ;\n" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const metroDefault: MetroResolver = () => ({ type: "empty" });

    const resolve = await resolverOf(project.root);

    expect(() => resolve(contextOf(metroDefault, false), "@noverax/courier/routes", "ios")).toThrow(
      /courier\.config\.mjs did not load/,
    );
    expect(resolve(contextOf(metroDefault, true), "@noverax/courier/routes", "ios").filePath).toBe(
      join(project.root, MODULE),
    );
    expect(readFileSync(join(project.root, MODULE), "utf8")).toMatch(
      /^throw new Error\("\[courier\] /,
    );
  }, 60_000);

  it("rewrites the module when a file the routes came from changes, saved in place or by replacing it", async () => {
    project = metroProject();
    const root = project.root;
    await resolverOf(root);

    project.edit("src/apis.mjs", (code) =>
      code.replace('view: endpoint.get("cart")', 'view: endpoint.get("cart").expose()'),
    );
    await vi.waitFor(() => expect(moduleOf(root)).toContain('"cart.view"'), REWRITTEN);
    const apis = join(root, "src/apis.mjs");
    writeFileSync(
      `${apis}.saving`,
      readFileSync(apis, "utf8").replace('.post("charge")', '.post("charge").expose()'),
    );
    renameSync(`${apis}.saving`, apis);
    await vi.waitFor(() => expect(moduleOf(root)).toContain('"charge"'), REWRITTEN);
  }, 90_000);

  it("reads the routes anew when the config is loaded again, and adds no watcher", async () => {
    project = metroProject();
    const file = join(project.root, MODULE);
    await resolverOf(project.root);
    const watchers = (await routesFile(project.root, undefined, file, ELSEWHERE)).watchers.size;

    await resolverOf(project.root);

    expect((await routesFile(project.root, undefined, file, ELSEWHERE)).watchers.size).toBe(
      watchers,
    );
    expect(watchers).toBeGreaterThan(0);
  }, 60_000);

  it("watches a folder named outside the project", async () => {
    project = metroProject({ "courier.config.mjs": CONFIG_JS });
    const outside = mkdtempSync(join(tmpdir(), "courier-metro-out-"));
    try {
      const config = await withCourier({ projectRoot: project.root }, { outDir: outside });
      const inside = await withCourier({ projectRoot: project.root, watchFolders: [] });

      expect(config.watchFolders).toEqual([outside]);
      expect(inside.watchFolders).toEqual([]);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  }, 60_000);

  it.skipIf(!posixUser)(
    "fails with why where the module's folder cannot be written",
    async () => {
      project = metroProject();
      const locked = mkdtempSync(join(tmpdir(), "courier-metro-locked-"));
      chmodSync(locked, 0o500);
      try {
        await expect(
          withCourier({ projectRoot: project.root }, { outDir: join(locked, "routes") }),
        ).rejects.toMatchObject({ code: "ROUTES_NOT_WRITTEN" });
      } finally {
        chmodSync(locked, 0o700);
        rmSync(locked, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
