/**
 * @vitest-environment node
 *
 * esbuild with the plugin that takes the routes from a module on disk, as
 * Angular's builders run it: the page's bundle carries the routes, which
 * resolve to the module written; a build fails while the config cannot be
 * read, a host that watches is handed the module that says why; and a page
 * that takes the config itself fails. Requires a build of this package and
 * of the core first.
 */
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { afterEach, describe, expect, it, vi } from "vitest";

import { writtenRoutesPlugin } from "../../src/esbuild/written-routes-plugin";
import { forgetRoutesFiles } from "../../src/routes-file/routes-file";
import type { TempProject } from "../vite/temp-project";
import { CONFIG_PAGE_JS, jsProject, PAGE_JS } from "../webpack/js-project";

let project: TempProject | undefined;
let folder: string | undefined;

afterEach(() => {
  vi.restoreAllMocks();
  forgetRoutesFiles();
  project?.remove();
  project = undefined;
  if (folder !== undefined) rmSync(folder, { recursive: true, force: true });
  folder = undefined;
});

/* The page's bundle, or the messages esbuild built none with. */
async function bundle(
  root: string,
  file: string,
  watch: boolean,
): Promise<{ code: string; errors: string[] }> {
  const plugin = await writtenRoutesPlugin({ root, file, watch, elsewhere: "the outDir option" });
  try {
    const result = await build({
      absWorkingDir: root,
      entryPoints: ["src/page.mjs"],
      bundle: true,
      write: false,
      format: "esm",
      logLevel: "silent",
      plugins: [plugin],
    });
    return { code: result.outputFiles[0]?.text ?? "", errors: [] };
  } catch (error) {
    const errors: unknown = Reflect.get(Object(error), "errors");
    return {
      code: "",
      errors: Array.isArray(errors)
        ? errors.map((each: unknown) => String(Reflect.get(Object(each), "text")))
        : [String(error)],
    };
  }
}

const moduleIn = (): string => {
  folder = realpathSync(mkdtempSync(join(tmpdir(), "courier-written-")));
  return join(folder, "routes.js");
};

describe("writtenRoutesPlugin under esbuild", () => {
  it("writes the routes to the module, and builds the page's bundle from it", async () => {
    project = jsProject({ "src/page.mjs": PAGE_JS });
    const file = moduleIn();

    const { code, errors } = await bundle(project.root, file, false);

    expect(errors).toEqual([]);
    expect(code.replace(/\s/g, "")).toContain('"cart.add":{"type":"mutation"}');
    expect(readFileSync(file, "utf8")).toMatch(/^export const routes = /);
  }, 60_000);

  it("fails a build while the config cannot be read, and hands a host that watches the module that says why", async () => {
    project = jsProject({ "src/page.mjs": PAGE_JS, "src/apis.mjs": "export const shop = ;\n" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const file = moduleIn();

    const built = await bundle(project.root, file, false);
    const watched = await bundle(project.root, file, true);

    expect(built.errors.join("\n")).toMatch(/\[courier\] courier\.config\.mjs did not load/);
    expect(watched.errors).toEqual([]);
    expect(watched.code).toContain("[courier]");
  }, 60_000);

  it("fails a page that takes the config, which would ship the server's settings", async () => {
    project = jsProject({ "src/page.mjs": CONFIG_PAGE_JS });

    const { errors } = await bundle(project.root, moduleIn(), false);

    expect(errors.join("\n")).toContain("courier.config.mjs is imported into a page as a value");
  }, 60_000);
});
