/**
 * @vitest-environment node
 *
 * Rollup's watch mode with the routes plugin: an edit that opens an endpoint
 * builds the routes again, a config that breaks keeps the routes read last
 * with a warning, and mending it brings the routes back. Requires a build of
 * this package and of the core first.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type RollupWatcher, watch } from "rollup";
import { afterEach, describe, expect, it, vi } from "vitest";

import { courierRoutes } from "../../src/rollup/courier-routes";
import type { TempProject } from "../vite/temp-project";
import { jsProject, PAGE_JS } from "../webpack/js-project";

let project: TempProject | undefined;
let watcher: RollupWatcher | undefined;

afterEach(async () => {
  await watcher?.close();
  watcher = undefined;
  vi.restoreAllMocks();
  project?.remove();
  project = undefined;
});

/* Each bundle the watcher writes, and each warning, in turn: the next to pass a check is waited for. */
function watched(root: string): {
  warnings: string[];
  next(check: (code: string) => boolean): Promise<string>;
} {
  const warnings: string[] = [];
  const waiting: Array<{ check: (code: string) => boolean; settle: (code: string) => void }> = [];
  watcher = watch({
    input: join(root, "src/page.mjs"),
    plugins: [courierRoutes()],
    output: { file: join(root, "dist/page.js"), format: "es" },
    onwarn: (warning) => {
      warnings.push(warning.message);
    },
  });
  watcher.on("event", (event) => {
    if (event.code !== "BUNDLE_END") return;
    void event.result.close();
    const code = readFileSync(join(root, "dist/page.js"), "utf8").replace(/\s/g, "");
    for (const wait of [...waiting]) {
      if (!wait.check(code)) continue;
      waiting.splice(waiting.indexOf(wait), 1);
      wait.settle(code);
    }
  });
  return {
    warnings,
    next: (check) => new Promise((settle) => waiting.push({ check, settle })),
  };
}

describe("courierRoutes under Rollup's watch", () => {
  it("builds the routes again after an edit, keeps the last ones while the config is broken, and takes the mended ones", async () => {
    project = jsProject({ "src/page.mjs": PAGE_JS });
    vi.spyOn(process, "cwd").mockReturnValue(project.root);
    const builds = watched(project.root);
    await builds.next((code) => code.includes('"cart.add"'));

    const opened = builds.next((code) => code.includes('"cart.view"'));
    project.edit("src/apis.mjs", (code) =>
      code.replace('view: endpoint.get("cart")', 'view: endpoint.get("cart").expose()'),
    );
    await opened;
    const broken = builds.next(() => builds.warnings.length > 0);
    project.edit("src/apis.mjs", (code) => code.replace("defineApi({", "defineApi({ broken"));
    const kept = await broken;
    const mended = builds.next(
      (code) => code.includes('"cart.add"') && !code.includes('"cart.view"'),
    );
    project.edit("src/apis.mjs", (code) =>
      code
        .replace("defineApi({ broken", "defineApi({")
        .replace('view: endpoint.get("cart").expose()', 'view: endpoint.get("cart")'),
    );
    await mended;

    expect(kept).toContain('"cart.view"');
    expect(builds.warnings.join("\n")).toContain("[courier]");
  }, 90_000);
});
