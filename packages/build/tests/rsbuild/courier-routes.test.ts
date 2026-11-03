/**
 * @vitest-environment node
 *
 * Rsbuild with the routes plugin: a page's environment and a server's both
 * build the routes in place of the module the package ships, and a page
 * that takes the config fails while a server may take it. Requires a build
 * of this package and of the core first.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRsbuild } from "@rsbuild/core";
import { afterEach, describe, expect, it } from "vitest";

import { courierRoutes } from "../../src/rsbuild/courier-routes";
import type { TempProject } from "../vite/temp-project";
import { CONFIG_PAGE_JS, jsProject, PAGE_JS } from "../webpack/js-project";

let project: TempProject | undefined;

afterEach(() => {
  project?.remove();
  project = undefined;
});

/* What Rsbuild hands a plugin after a build: the build's errors, which its rejection leaves out. */
interface BuildStats {
  toJson(options: { errors: boolean }): { errors?: Array<{ message: string }> };
}

/* Build the entry for the target: every script it wrote, or the errors it failed with. */
async function build(
  root: string,
  entry: string,
  target: "web" | "node",
): Promise<{ code: string; errors: string[] }> {
  const errors: string[] = [];
  const capture = {
    name: "capture-errors",
    setup(api: { onAfterBuild(hook: (params: { stats?: BuildStats }) => void): void }) {
      api.onAfterBuild(({ stats }) => {
        for (const each of stats?.toJson({ errors: true }).errors ?? []) errors.push(each.message);
      });
    },
  };
  const rsbuild = await createRsbuild({
    cwd: root,
    loadEnv: false,
    rsbuildConfig: {
      logLevel: "silent",
      plugins: [courierRoutes(), capture],
      source: { entry: { index: join(root, entry) } },
      output: { target, minify: false, distPath: { root: "dist" }, cleanDistPath: true },
      performance: { chunkSplit: { strategy: "all-in-one" } },
    },
  });
  try {
    const result = await rsbuild.build();
    await result.close();
  } catch (error) {
    if (errors.length === 0) throw error;
    return { code: "", errors };
  }
  return { code: scriptsIn(join(root, "dist")), errors };
}

function scriptsIn(folder: string): string {
  return readdirSync(folder, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".js"))
    .map((path) => readFileSync(join(folder, path), "utf8"))
    .join("\n");
}

describe("courierRoutes under Rsbuild", () => {
  it("builds the routes of every source into a page, and nothing of the module the package ships", async () => {
    project = jsProject({ "src/page.mjs": `${PAGE_JS}\nconsole.log(shop);\n` });

    const { code, errors } = await build(project.root, "src/page.mjs", "web");

    expect(errors).toEqual([]);
    expect(code).toMatch(/"cart\.add":\s*\{\s*"?type"?:\s*"mutation"\s*\}/);
    expect(code).not.toContain("ROUTES_NOT_BUILT");
    expect(code).not.toContain("shop.example.com");
  }, 60_000);

  it("fails a page that takes the config, which would ship the server's settings", async () => {
    project = jsProject({ "src/page.mjs": `${CONFIG_PAGE_JS}\nconsole.log(sources);\n` });

    const { errors } = await build(project.root, "src/page.mjs", "web");

    expect(errors.join("\n")).toContain("courier.config.mjs is imported into a page as a value");
  }, 60_000);

  it("lets a server's bundle take the config and the routes alike", async () => {
    project = jsProject({
      "src/server.mjs": `${CONFIG_PAGE_JS}\n${PAGE_JS}\nconsole.log(sources, shop);\n`,
    });

    const { code, errors } = await build(project.root, "src/server.mjs", "node");

    expect(errors).toEqual([]);
    expect(code).toMatch(/"cart\.add":\s*\{\s*"?type"?:\s*"mutation"\s*\}/);
  }, 60_000);
});
