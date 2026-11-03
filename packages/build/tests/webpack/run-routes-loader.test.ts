/**
 * @vitest-environment node
 *
 * The routes loader as webpack, Rspack and Turbopack run it: the routes in
 * place of the module the package ships, every file they came from handed
 * to the bundler, a refusal of the config in a page's bundle, and what a
 * build and a dev server each do with a config that breaks. Requires a
 * build of this package and of the core first.
 */
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RoutesReadError } from "../../src/engine/routes-read-error";
import type { RoutesLoaderContext } from "../../src/webpack/routes-loader-context";
import { runRoutesLoader } from "../../src/webpack/run-routes-loader";
import type { TempProject } from "../vite/temp-project";
import { tempProject } from "../vite/temp-project";
import { jsProject } from "./js-project";

let project: TempProject | undefined;

afterEach(() => {
  project?.remove();
  project = undefined;
  vi.restoreAllMocks();
});

/* A loader context, and what the loader told the bundler through it. */
function loaderContext(options: unknown, mode?: string, resourcePath = "/stub.js") {
  const told = {
    files: [] as string[],
    missing: [] as string[],
    folders: [] as string[],
    errors: [] as Error[],
  };
  const context: RoutesLoaderContext = {
    resourcePath,
    mode,
    getOptions: () => options,
    cacheable: () => undefined,
    async: () => () => undefined,
    addDependency: (file) => told.files.push(file),
    addMissingDependency: (path) => told.missing.push(path),
    addContextDependency: (folder) => told.folders.push(folder),
    emitError: (error) => told.errors.push(error),
  };
  return { context, told };
}

describe("runRoutesLoader", () => {
  it("builds the routes of every source, and hands the bundler each file they came from", async () => {
    project = jsProject();
    const { context, told } = loaderContext({ root: project.root }, "production");

    const code = await runRoutesLoader(context);

    expect(code).toContain('"cart.add":{"type":"mutation"}');
    expect(code).toContain('"payments":{"source":"payments","endpoints":{}}');
    expect(code).not.toContain("shop.example.com");
    expect(told.files).toEqual(
      expect.arrayContaining([
        realpathSync(join(project.root, "courier.config.mjs")),
        realpathSync(join(project.root, "src/apis.mjs")),
      ]),
    );
  }, 60_000);

  it("follows where a config may appear once none is found", async () => {
    project = tempProject({ "src/apis.mjs": "export {};\n" });
    const { context, told } = loaderContext({ root: project.root }, "development");

    await expect(runRoutesLoader(context)).rejects.toMatchObject({ code: "CONFIG_NOT_FOUND" });
    expect(told.missing).toContain(join(project.root, "courier.config.ts"));
  }, 60_000);

  it("refuses the config itself, on the rule that matches it in a page's bundle", async () => {
    project = jsProject();
    const configFile = join(project.root, "courier.config.mjs");
    const { context } = loaderContext(
      { root: project.root, refuse: "config-in-page" },
      "production",
      configFile,
    );

    await expect(runRoutesLoader(context)).rejects.toThrow(
      "[courier] courier.config.mjs is imported into a page as a value",
    );
  });

  it("fails a build whose config breaks, even after a reading that worked", async () => {
    project = jsProject();
    const options = { root: project.root };
    await runRoutesLoader(loaderContext(options, "production").context);
    project.edit("src/apis.mjs", (code) => `${code}\nthrow new Error("the definitions broke");\n`);

    const failed = runRoutesLoader(loaderContext(options, "production").context);

    await expect(failed).rejects.toBeInstanceOf(RoutesReadError);
    await expect(failed).rejects.toMatchObject({ code: "CONFIG_NOT_LOADED" });
  }, 60_000);

  it("keeps the routes it read last under a dev server, and reports why over the page", async () => {
    project = jsProject();
    const options = { root: project.root };
    const first = await runRoutesLoader(loaderContext(options, "development").context);
    project.edit("src/apis.mjs", (code) => `${code}\nthrow new Error("the definitions broke");\n`);
    const { context, told } = loaderContext(options, "development");

    const kept = await runRoutesLoader(context);

    expect(kept).toBe(first);
    expect(told.errors).toHaveLength(1);
    expect(told.errors[0]?.message).toMatch(/^\[courier\] .*the definitions broke/s);
  }, 60_000);

  it("says why in the terminal under a dev server that shows a module no errors, as Turbopack's", async () => {
    project = jsProject();
    const options = { root: project.root };
    const first = await runRoutesLoader(loaderContext(options, "development").context);
    project.edit("src/apis.mjs", (code) => `${code}\nthrow new Error("the definitions broke");\n`);
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { context } = loaderContext(options, "development");
    delete context.emitError;

    const kept = await runRoutesLoader(context);

    expect(kept).toBe(first);
    expect(logged).toHaveBeenCalledWith(
      expect.stringMatching(/^\[courier\] .*the definitions broke/s),
    );
  }, 60_000);

  it("fails the module under a dev server when no routes were ever read", async () => {
    project = jsProject({ "src/apis.mjs": 'throw new Error("never worked");\n' });
    const { context } = loaderContext({ root: project.root }, "development");

    await expect(runRoutesLoader(context)).rejects.toMatchObject({ code: "CONFIG_NOT_LOADED" });
  }, 60_000);

  it("refuses options a Courier rule never hands it", async () => {
    await expect(runRoutesLoader(loaderContext({}).context)).rejects.toThrow(
      "The routes loader was given no project root",
    );
  });
});
