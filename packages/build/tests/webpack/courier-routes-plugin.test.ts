/**
 * @vitest-environment node
 *
 * webpack with the routes plugin: a page's bundle carries the routes of
 * every source and nothing of the module the package ships, a page that
 * takes the config fails, and a server's bundle may take it. Requires a
 * build of this package and of the core first.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import webpack from "webpack";

import { CourierRoutesPlugin } from "../../src/webpack/courier-routes-plugin";
import type { TempProject } from "../vite/temp-project";
import { CONFIG_PAGE_JS, jsProject, PAGE_JS } from "./js-project";

let project: TempProject | undefined;

afterEach(() => {
  project?.remove();
  project = undefined;
});

/* The bundle webpack builds from the entry, or the errors it built none with. */
function compile(
  root: string,
  entry: string,
  target: "web" | "node",
): Promise<{ code: string; errors: string[] }> {
  const compiler = webpack({
    context: root,
    mode: "production",
    target,
    entry: join(root, entry),
    output: { path: join(root, "dist"), filename: "bundle.js", library: { type: "commonjs2" } },
    optimization: { minimize: false },
    plugins: [new CourierRoutesPlugin()],
  });
  return new Promise((resolve, reject) => {
    compiler.run((error, stats) => {
      compiler.close(() => undefined);
      if (error) return reject(error);
      const errors = stats?.toJson({ errors: true }).errors?.map((each) => each.message) ?? [];
      const code = errors.length > 0 ? "" : readFileSync(join(root, "dist/bundle.js"), "utf8");
      resolve({ code, errors });
    });
  });
}

describe("CourierRoutesPlugin under webpack", () => {
  it("builds the routes of every source into a page, and nothing of the module the package ships", async () => {
    project = jsProject({ "src/page.mjs": PAGE_JS });

    const { code, errors } = await compile(project.root, "src/page.mjs", "web");

    expect(errors).toEqual([]);
    expect(code).toContain('"cart.add":{"type":"mutation"}');
    expect(code).not.toContain("ROUTES_NOT_BUILT");
    expect(code).not.toContain("shop.example.com");
  }, 60_000);

  it("fails a page that takes the config, which would ship the server's settings", async () => {
    project = jsProject({ "src/page.mjs": CONFIG_PAGE_JS });

    const { errors } = await compile(project.root, "src/page.mjs", "web");

    expect(errors.join("\n")).toContain("courier.config.mjs is imported into a page as a value");
  }, 60_000);

  it("lets a server's bundle take the config and the routes alike", async () => {
    project = jsProject({ "src/server.mjs": `${CONFIG_PAGE_JS}\n${PAGE_JS}` });

    const { code, errors } = await compile(project.root, "src/server.mjs", "node");

    expect(errors).toEqual([]);
    expect(code).toContain('"cart.add":{"type":"mutation"}');
  }, 60_000);
});
