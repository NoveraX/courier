/**
 * @vitest-environment node
 *
 * Metro itself, its config `require()`ing the plugin as most do: a build
 * carries the routes of every source and nothing of the module the package
 * ships, a build fails while the config cannot be read, and an app that
 * takes the config itself fails. Requires a build of this package and of
 * the core first.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import Metro from "metro";
import { loadConfig } from "metro-config";
import { afterEach, describe, expect, it } from "vitest";

import { forgetRoutesFiles } from "../../src/routes-file/routes-file";
import type { TempProject } from "../vite/temp-project";
import { CONFIG_PAGE_JS } from "../webpack/js-project";
import { metroProject } from "./metro-project";

const TRANSFORMER = resolve(import.meta.dirname, "fixtures/babel-transformer.cjs");

/* Metro's runtime, which every bundle takes, from the repository: the project holds Courier's packages alone. */
const RUNTIME = dirname(createRequire(import.meta.url).resolve("metro-runtime/package.json"));

/* A config as an app writes one, but for the transformer, the runtime's place and Metro's reporting. */
const METRO_CONFIG = `const { withCourier } = require("@noverax/courier-build/metro");

module.exports = withCourier({
  projectRoot: __dirname,
  watchFolders: [${JSON.stringify(RUNTIME)}],
  resolver: { nodeModulesPaths: [${JSON.stringify(dirname(RUNTIME))}] },
  transformer: { babelTransformerPath: ${JSON.stringify(TRANSFORMER)} },
  cacheStores: [],
  reporter: { update() {} },
});
`;

/* An app that takes its routes. */
const ROUTES_APP = `import { routes } from "@noverax/courier/routes";

globalThis.shop = routes.shop;
`;

let project: TempProject | undefined;

afterEach(() => {
  forgetRoutesFiles();
  project?.remove();
  project = undefined;
});

/* The bundle Metro builds for iOS, as a release build is. */
async function bundle(root: string): Promise<string> {
  const config = await loadConfig({ cwd: root, config: join(root, "metro.config.cjs") });
  const out = join(root, "dist/index.bundle.js");
  mkdirSync(dirname(out), { recursive: true });
  await Metro.runBuild(config, {
    entry: "./index.js",
    platform: "ios",
    dev: false,
    minify: false,
    out,
  });
  return readFileSync(out, "utf8");
}

describe("withCourier under Metro", () => {
  it("builds the routes of every source into the app, and nothing of the module the package ships", async () => {
    project = metroProject({ "metro.config.cjs": METRO_CONFIG, "index.js": ROUTES_APP });

    const code = (await bundle(project.root)).replace(/\s/g, "");

    expect(code).toContain('"cart.add":{"type":"mutation"}');
    expect(code).not.toContain("ROUTES_NOT_BUILT");
    expect(code).not.toContain("shop.example.com");
  }, 120_000);

  it("fails a build while the config cannot be read, with why", async () => {
    project = metroProject({
      "metro.config.cjs": METRO_CONFIG,
      "index.js": ROUTES_APP,
      "src/apis.mjs": "export const shop = ;\n",
    });

    await expect(bundle(project.root)).rejects.toThrow(/courier\.config\.mjs did not load/);
  }, 120_000);

  it("fails an app that takes the config itself", async () => {
    project = metroProject({
      "metro.config.cjs": METRO_CONFIG,
      "index.js": CONFIG_PAGE_JS.replace("../courier.config.mjs", "./courier.config.mjs"),
    });

    await expect(bundle(project.root)).rejects.toThrow(
      "courier.config.mjs is imported into the app's bundle as a value",
    );
  }, 120_000);
});
