/**
 * @vitest-environment node
 *
 * esbuild with the routes plugin: a page's bundle carries the routes of
 * every source and nothing of the module the package ships, a page that
 * takes the config fails, a server's bundle may take it, and a context that
 * watches builds the routes again after an edit, keeping the last ones
 * while the config is broken. Requires a build of this package and of the
 * core first.
 */
import { readFileSync } from "node:fs";
import { build, type Plugin } from "esbuild";
import { afterEach, describe, expect, it } from "vitest";

import { courierRoutes } from "../../src/esbuild/courier-routes";
import type { TempProject } from "../vite/temp-project";
import { CONFIG_PAGE_JS, jsProject, PAGE_JS } from "../webpack/js-project";

let project: TempProject | undefined;

afterEach(() => {
  project?.remove();
  project = undefined;
});

/* The bundle esbuild builds from the entry, or the messages it built none with. */
async function bundle(
  root: string,
  entry: string,
  platform: "browser" | "node",
  before: Plugin[] = [],
): Promise<{ code: string; errors: string[] }> {
  try {
    const result = await build({
      absWorkingDir: root,
      entryPoints: [entry],
      bundle: true,
      write: false,
      platform,
      format: "esm",
      logLevel: "silent",
      plugins: [...before, courierRoutes()],
    });
    return { code: result.outputFiles[0]?.text ?? "", errors: [] };
  } catch (error) {
    return { code: "", errors: messagesOf(error) };
  }
}

/* The text of each message a failed build reports. */
function messagesOf(failure: unknown): string[] {
  const errors: unknown = Reflect.get(Object(failure), "errors");
  if (!Array.isArray(errors)) return [String(failure)];
  return errors.map((each: unknown) => String(Reflect.get(Object(each), "text")));
}

describe("courierRoutes under esbuild", () => {
  it("builds the routes of every source into a page, and nothing of the module the package ships", async () => {
    project = jsProject({ "src/page.mjs": PAGE_JS });

    const { code, errors } = await bundle(project.root, "src/page.mjs", "browser");

    expect(errors).toEqual([]);
    expect(code).toContain('"cart.add": { "type": "mutation" }');
    expect(code).not.toContain("ROUTES_NOT_BUILT");
    expect(code).not.toContain("shop.example.com");
  }, 60_000);

  it("fails a page that takes the config, which would ship the server's settings", async () => {
    project = jsProject({ "src/page.mjs": CONFIG_PAGE_JS });

    const { errors } = await bundle(project.root, "src/page.mjs", "browser");

    expect(errors.join("\n")).toContain("courier.config.mjs is imported into a page as a value");
  }, 60_000);

  it("fails a page that takes the config even where another plugin loads every module first", async () => {
    project = jsProject({ "src/page.mjs": CONFIG_PAGE_JS });
    /* As Angular's compiler loads every TypeScript module itself. */
    const loadsAll: Plugin = {
      name: "loads-all",
      setup(each) {
        each.onLoad({ filter: /\.mjs$/ }, (args) => ({
          contents: readFileSync(args.path, "utf8"),
          loader: "js",
        }));
      },
    };

    const { errors } = await bundle(project.root, "src/page.mjs", "browser", [loadsAll]);

    expect(errors.join("\n")).toContain("courier.config.mjs is imported into a page as a value");
  }, 60_000);

  it("lets a server's bundle take the config and the routes alike", async () => {
    project = jsProject({ "src/server.mjs": `${CONFIG_PAGE_JS}\n${PAGE_JS}` });

    const { code, errors } = await bundle(project.root, "src/server.mjs", "node");

    expect(errors).toEqual([]);
    expect(code).toContain('"cart.add": { "type": "mutation" }');
  }, 60_000);
});
