/**
 * @vitest-environment node
 *
 * Rollup and Rolldown with the routes plugin: a page's bundle carries the
 * routes of every source and nothing of the module the package ships, a
 * page that takes the config fails, and a server's bundle, said to be one,
 * may take it. Requires a build of this package and of the core first.
 */
import { join } from "node:path";
import { rolldown } from "rolldown";
import { rollup } from "rollup";
import { afterEach, describe, expect, it, vi } from "vitest";

import { courierRoutes } from "../../src/rollup/courier-routes";
import type { RollupRoutesOptions } from "../../src/rollup/rollup-routes-options";
import type { TempProject } from "../vite/temp-project";
import { CONFIG_PAGE_JS, jsProject, PAGE_JS } from "../webpack/js-project";

let project: TempProject | undefined;

afterEach(() => {
  vi.restoreAllMocks();
  project?.remove();
  project = undefined;
});

/* The bundle the bundler builds from the entry, run from the project's root as its CLI is. */
async function bundle(
  bundler: "rollup" | "rolldown",
  root: string,
  entry: string,
  options: RollupRoutesOptions = {},
): Promise<string> {
  vi.spyOn(process, "cwd").mockReturnValue(root);
  const input = join(root, entry);
  const plugins = [courierRoutes(options)];
  const built =
    bundler === "rollup"
      ? await rollup({ input, plugins, onwarn: () => undefined })
      : await rolldown({ input, cwd: root, plugins });
  const { output } = await built.generate({ format: "es" });
  await built.close();
  return output[0].code;
}

describe.each(["rollup", "rolldown"] as const)("courierRoutes under %s", (bundler) => {
  it("builds the routes of every source into a page, and nothing of the module the package ships", async () => {
    project = jsProject({ "src/page.mjs": PAGE_JS });

    const code = await bundle(bundler, project.root, "src/page.mjs");

    expect(code.replace(/\s/g, "")).toContain('"cart.add":{"type":"mutation"}');
    expect(code).not.toContain("ROUTES_NOT_BUILT");
    expect(code).not.toContain("shop.example.com");
  }, 60_000);

  it("fails a page that takes the config, which would ship the server's settings", async () => {
    project = jsProject({ "src/page.mjs": CONFIG_PAGE_JS });

    await expect(bundle(bundler, project.root, "src/page.mjs")).rejects.toThrow(
      "courier.config.mjs is imported into a page as a value",
    );
  }, 60_000);

  it("lets a bundle said to be a server's take the config and the routes alike", async () => {
    project = jsProject({ "src/server.mjs": `${CONFIG_PAGE_JS}\n${PAGE_JS}` });

    const code = await bundle(bundler, project.root, "src/server.mjs", { server: true });

    expect(code.replace(/\s/g, "")).toContain('"cart.add":{"type":"mutation"}');
  }, 60_000);
});
