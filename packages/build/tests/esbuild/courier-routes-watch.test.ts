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

/* Each build the context ends, in turn: the first one after the last waited for that passes a check. */
function builds(): {
  plugin: Plugin;
  next(check: (result: BuildResult) => boolean): Promise<BuildResult>;
} {
  const ended: BuildResult[] = [];
  let taken = 0;
  let waiting: (() => void) | undefined;
  const take = (check: (result: BuildResult) => boolean): BuildResult | undefined => {
    const at = ended.findIndex((result, index) => index >= taken && check(result));
    if (at === -1) return undefined;
    taken = at + 1;
    return ended[at];
  };
  return {
    plugin: {
      name: "builds",
      setup(build) {
        build.onEnd((result) => {
          ended.push(result);
          waiting?.();
        });
      },
    },
    next: (check) =>
      new Promise((settle) => {
        const look = (): void => {
          const found = take(check);
          if (found === undefined) return;
          waiting = undefined;
          settle(found);
        };
        waiting = look;
        look();
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
        .replace('view: endpoint.get("cart").expose()', 'view: endpoint.get("cart")'),
    );
    const mended = await watched.next(
      (result) => codeOf(result).includes('"cart.add"') && !codeOf(result).includes('"cart.view"'),
    );

    expect(opened.errors).toEqual([]);
    expect(broken.errors).toEqual([]);
    expect(broken.warnings[0]?.text).toContain("[courier]");
    expect(codeOf(broken)).toContain('"cart.view"');
    expect(mended.warnings).toEqual([]);
  }, 90_000);
});
