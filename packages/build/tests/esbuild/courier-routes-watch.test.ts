/**
 * @vitest-environment node
 *
 * esbuild's watch mode with the routes plugin: an edit that opens an
 * endpoint builds the routes again, a config that breaks keeps the routes
 * read last with a warning, and mending it brings the routes back. Requires
 * a build of this package and of the core first.
 */
import { type BuildResult, context, type Plugin } from "esbuild";
import { afterEach, describe, expect, it } from "vitest";

import { courierRoutes } from "../../src/esbuild/courier-routes";
import type { TempProject } from "../vite/temp-project";
import { jsProject, PAGE_JS } from "../webpack/js-project";

let project: TempProject | undefined;
let dispose: (() => Promise<void>) | undefined;

afterEach(async () => {
  await dispose?.();
  dispose = undefined;
  project?.remove();
  project = undefined;
});

/* Each build the context ends, in turn: the next one that passes a check is waited for. */
function builds(): {
  plugin: Plugin;
  next(check: (result: BuildResult) => boolean): Promise<BuildResult>;
} {
  const ended: BuildResult[] = [];
  const waiting: Array<{
    check: (result: BuildResult) => boolean;
    settle: (result: BuildResult) => void;
  }> = [];
  return {
    plugin: {
      name: "builds",
      setup(build) {
        build.onEnd((result) => {
          ended.push(result);
          for (const wait of [...waiting]) {
            if (!wait.check(result)) continue;
            waiting.splice(waiting.indexOf(wait), 1);
            wait.settle(result);
          }
        });
      },
    },
    next: (check) =>
      new Promise((settle) => {
        const done = ended.find(check);
        if (done !== undefined) settle(done);
        else waiting.push({ check, settle });
      }),
  };
}

const codeOf = (result: BuildResult): string => result.outputFiles?.[0]?.text ?? "";

describe("courierRoutes under esbuild's watch", () => {
  it("builds the routes again after an edit, keeps the last ones while the config is broken, and takes the mended ones", async () => {
    project = jsProject({ "src/page.mjs": PAGE_JS });
    const watched = builds();
    const watching = await context({
      absWorkingDir: project.root,
      entryPoints: ["src/page.mjs"],
      bundle: true,
      write: false,
      format: "esm",
      logLevel: "silent",
      plugins: [courierRoutes(), watched.plugin],
    });
    dispose = () => watching.dispose();
    await watching.watch();
    await watched.next((result) => codeOf(result).includes('"cart.add"'));

    project.edit("src/apis.mjs", (code) =>
      code.replace('view: endpoint.get("cart")', 'view: endpoint.get("cart").expose()'),
    );
    const opened = await watched.next((result) => codeOf(result).includes('"cart.view"'));
    project.edit("src/apis.mjs", (code) => code.replace("defineApi({", "defineApi({ broken"));
    const broken = await watched.next((result) => result.warnings.length > 0);
    project.edit("src/apis.mjs", (code) =>
      code
        .replace("defineApi({ broken", "defineApi({")
        .replace('.post("charge")', '.post("charge").expose()'),
    );
    const mended = await watched.next((result) => codeOf(result).includes('"charge"'));

    expect(opened.errors).toEqual([]);
    expect(broken.errors).toEqual([]);
    expect(broken.warnings[0]?.text).toContain("[courier]");
    expect(codeOf(broken)).toContain('"cart.view"');
    expect(mended.warnings).toEqual([]);
  }, 90_000);
});
