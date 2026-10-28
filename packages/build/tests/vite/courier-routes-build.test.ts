/**
 * @vitest-environment node
 *
 * `vite build` with the routes plugin: a page's bundle and a server's carry
 * the routes of every source and nothing of the module the package ships,
 * the core stays the one installed package a server imports, and a build
 * fails with why when the routes cannot be read or a page imports the
 * config. Requires a build of this package and of the core first.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "vite";
import { afterEach, describe, expect, it } from "vitest";

import { courierRoutes } from "../../src/vite/courier-routes";
import { APIS, CONFIG, type TempProject, tempProject } from "./temp-project";

const PAGE = `import { routes } from "@noverax/courier/routes";\nexport const shop = routes.shop;\nexport { routes };\n`;
const SERVER = `import { createProxyCaller } from "@noverax/courier";\nimport { routes } from "@noverax/courier/routes";\nexport const client = createProxyCaller(routes.shop);\nexport { routes };\n`;

let project: TempProject | undefined;

afterEach(() => {
  project?.remove();
  project = undefined;
});

async function buildPage(
  root: string,
  mode = "production",
  alias: Record<string, string> = {},
): Promise<string> {
  await build({
    root,
    mode,
    configFile: false,
    logLevel: "silent",
    resolve: { alias },
    plugins: [courierRoutes()],
    build: { lib: { entry: "src/page.ts", formats: ["es"], fileName: "page" }, outDir: "dist" },
  });
  return readFileSync(join(root, "dist/page.js"), "utf8");
}

/* Symlinks kept, so the repository's linked packages sit in `node_modules`, as an install puts them. */
async function buildServer(root: string, entry = "src/server.ts"): Promise<string> {
  await build({
    root,
    configFile: false,
    logLevel: "silent",
    resolve: { preserveSymlinks: true },
    plugins: [courierRoutes()],
    build: {
      ssr: entry,
      outDir: "dist-server",
      rollupOptions: { output: { entryFileNames: "server.js" } },
    },
  });
  return readFileSync(join(root, "dist-server/server.js"), "utf8");
}

describe("courierRoutes in a build", () => {
  it("builds the routes of every source into a page, and nothing of the module the package ships", async () => {
    project = tempProject({
      "courier.config.ts": CONFIG,
      "src/apis.ts": APIS,
      "src/page.ts": PAGE,
    });

    const page = await buildPage(project.root);

    expect(page).toMatch(/"cart\.add":\s*\{\s*type:\s*"mutation"\s*\}/);
    expect(page).toMatch(/payments:\s*\{\s*source:\s*"payments",\s*endpoints:\s*\{\s*\}/);
    expect(page).not.toContain("ROUTES_NOT_BUILT");
    expect(page).not.toContain("shop.example.com");
  }, 60_000);

  it("builds them into a server's bundle, which keeps importing the installed core", async () => {
    project = tempProject({
      "courier.config.ts": CONFIG,
      "src/apis.ts": APIS,
      "src/server.ts": SERVER,
    });

    const server = await buildServer(project.root);

    expect(server).toMatch(/from\s*"@noverax\/courier"/);
    expect(server).toContain('"cart.add"');
    expect(server).not.toContain("ROUTES_NOT_BUILT");
  }, 60_000);

  it("answers the routes before an alias the app gives the whole core package", async () => {
    project = tempProject({
      "courier.config.ts": CONFIG,
      "src/apis.ts": APIS,
      "src/page.ts": PAGE,
    });
    const core = resolve(import.meta.dirname, "../../../core/lib");

    const page = await buildPage(project.root, "production", { "@noverax/courier": core });

    expect(page).toContain('"cart.add"');
    expect(page).not.toContain("ROUTES_NOT_BUILT");
  }, 60_000);

  it("reads the routes with the env files of Vite's mode", async () => {
    project = tempProject({
      "courier.config.ts": CONFIG,
      "src/apis.ts": APIS,
      "src/page.ts": PAGE,
      ".env.staging": "SHOP_SEARCH_PUBLIC=1\n",
    });

    const page = await buildPage(project.root, "staging");

    expect(page).toContain("search");
  }, 60_000);

  it("fails the build with what the config threw", async () => {
    project = tempProject({
      "courier.config.ts": `${CONFIG}\nthrow new Error("SHOP_API_KEY is not set");\n`,
      "src/apis.ts": APIS,
      "src/page.ts": PAGE,
    });

    await expect(buildPage(project.root)).rejects.toThrow(
      /courier\.config\.ts did not load.*SHOP_API_KEY is not set/,
    );
  }, 60_000);

  it("fails the build with no config to read the routes from", async () => {
    project = tempProject({ "src/page.ts": PAGE });

    await expect(buildPage(project.root)).rejects.toThrow(/No courier\.config\.\* in/);
  }, 60_000);

  it("fails the build of a page that imports the config as a value", async () => {
    project = tempProject({
      "courier.config.ts": CONFIG,
      "src/apis.ts": APIS,
      "src/page.ts": `import config from "../courier.config";\nexport const names = Object.keys(config.sources);\n`,
    });

    await expect(buildPage(project.root)).rejects.toThrow(/imported into a page as a value/);
  }, 60_000);

  it("lets a server's bundle import the config", async () => {
    project = tempProject({
      "courier.config.ts": CONFIG,
      "src/apis.ts": APIS,
      "src/config-user.ts": `import config from "../courier.config";\nexport const names = Object.keys(config.sources);\n`,
    });

    await expect(buildServer(project.root, "src/config-user.ts")).resolves.toContain("sources");
  }, 60_000);
});
